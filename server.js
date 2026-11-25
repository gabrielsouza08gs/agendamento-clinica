// server.js
// Back-end da aplicação de agendamento de consultas.
//
// ARQUITETURA (Checkpoint Final):
// - db.js              -> banco de dados SQLite (tabelas grade_horarios e
//                         agendamentos).
// - regras.js          -> regras puras de datas, horários e celular (testáveis).
// - seo.js             -> gera título, descrição, Open Graph e JSON-LD a partir
//                         dos dados do banco (conteúdo semântico).
// - views/pagina.html  -> modelo HTML das páginas; o servidor preenche o <head>
//                         e o estado de cada página antes de enviar.
// - public/            -> arquivos estáticos (CSS e JavaScript do navegador).
// - test/              -> testes automatizados (npm test).

const express = require("express");
const fs = require("fs");
const path = require("path");

const banco = require("./db");
const { montarHead, escaparHTML, CLINICA } = require("./seo");
const {
  REGEX_HORA,
  formatarISO,
  dataValida,
  nomeDiaSemana,
  segundaDaSemana,
  gerarDiasUteis,
  horarioJaPassou,
  normalizarCelular,
} = require("./regras");

const app = express();
const PORT = process.env.PORT || 3000;

const MODELO_PAGINA = fs.readFileSync(path.join(__dirname, "views", "pagina.html"), "utf-8");

app.use(express.json());
// index:false -> a página inicial vem da rota "/" abaixo (gerada com os dados), não de um arquivo.
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// ---------- Páginas (HTML gerado a partir dos dados do banco) ----------

// Quantos horários livres ainda restam nesta semana (de agora em diante).
function contarVagasDaSemana(agora = new Date()) {
  const hoje = formatarISO(agora);
  const dias = gerarDiasUteis(hoje);
  const ocupados = banco.idsOcupados(dias[0].data, dias[4].data);
  let livres = 0;
  for (const d of dias) {
    for (const hora of banco.obterHorariosDoDia(d.dia)) {
      if (!ocupados.has(`${d.data}_${hora}`) && !horarioJaPassou(d.data, hora, agora)) livres++;
    }
  }
  return livres;
}

function renderizarPagina(req, res, pagina) {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const { head } = montarHead(pagina, {
    baseUrl,
    grade: banco.obterGrade(),
    vagasSemana: contarVagasDaSemana(),
  });

  const agendar = pagina === "agendar";
  const html = MODELO_PAGINA
    .replace("{{HEAD}}", () => head)
    .replace("{{NOME}}", () => escaparHTML(CLINICA.nome))
    .replace("{{VISTA}}", pagina)
    .replace("{{ATIVO_AGENDAR}}", agendar ? " ativo" : "")
    .replace("{{ATIVO_MEUS}}", agendar ? "" : " ativo")
    .replace("{{CURRENT_AGENDAR}}", agendar ? ' aria-current="page"' : "")
    .replace("{{CURRENT_MEUS}}", agendar ? "" : ' aria-current="page"')
    .replace("{{HIDDEN_AGENDAR}}", agendar ? "" : " hidden")
    .replace("{{HIDDEN_MEUS}}", agendar ? " hidden" : "");

  res.type("html").send(html);
}

app.get("/", (req, res) => renderizarPagina(req, res, "agendar"));
app.get("/meus-agendamentos", (req, res) => renderizarPagina(req, res, "meus-agendamentos"));

// robots.txt e sitemap.xml também são gerados (apontam para o endereço real do site)
app.get("/robots.txt", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.type("text/plain").send(
    `User-agent: *\nAllow: /\nDisallow: /meus-agendamentos\nDisallow: /api/\n\nSitemap: ${baseUrl}/sitemap.xml\n`
  );
});

app.get("/sitemap.xml", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `  <url><loc>${escaparHTML(baseUrl)}/</loc></url>\n` +
    `</urlset>\n`
  );
});

// ---------- API ----------

// GET /api/horarios?data=AAAA-MM-DD
// Grade da semana que contém a data informada (ou da semana atual),
// cruzando a grade fixa com os agendamentos do banco. Dias e horários que já
// passaram vêm como indisponíveis.
app.get("/api/horarios", (req, res) => {
  const agora = new Date();
  const hoje = formatarISO(agora);
  const dataAncora = req.query.data || hoje;
  if (!dataValida(dataAncora)) {
    return res.status(400).json({ erro: "Data inválida. Use o formato AAAA-MM-DD." });
  }

  const dias = gerarDiasUteis(dataAncora);
  const ocupados = banco.idsOcupados(dias[0].data, dias[4].data);
  const segundaDeHoje = formatarISO(segundaDaSemana(hoje));

  const diasComHorarios = dias.map((d) => ({
    data: d.data,
    dia: d.dia,
    passado: d.data < hoje,
    horarios: banco.obterHorariosDoDia(d.dia).map((hora) => {
      const id = `${d.data}_${hora}`;
      return { id, hora, disponivel: !ocupados.has(id) && !horarioJaPassou(d.data, hora, agora) };
    }),
  }));

  res.json({
    semana: {
      inicio: dias[0].data,
      fim: dias[4].data,
      podeVoltar: dias[0].data > segundaDeHoje, // false na semana atual
    },
    dias: diasComHorarios,
  });
});

// POST /api/meus-agendamentos  { consultas: [{ id, codigo }, ...] }
// Devolve só as consultas cujo id E código batem. Substitui a antiga listagem
// geral: não existe mais rota que entregue os dados de todos os pacientes.
app.post("/api/meus-agendamentos", (req, res) => {
  const consultas = req.body && req.body.consultas;
  if (!Array.isArray(consultas)) {
    return res.status(400).json({ erro: "Informe a lista de consultas." });
  }
  const pares = consultas
    .slice(0, 50)
    .filter((c) => c && typeof c.id === "string" && typeof c.codigo === "string");
  res.json(banco.buscarAgendamentosDoPaciente(pares));
});

// POST /api/agendar  { data, hora, paciente, celular }
// Devolve também o "codigo" secreto que permite cancelar essa consulta.
app.post("/api/agendar", (req, res) => {
  const { data, hora, paciente, celular } = req.body || {};

  if (!dataValida(data) || typeof hora !== "string" || !REGEX_HORA.test(hora)) {
    return res.status(400).json({ erro: "Informe uma data e um horário válidos." });
  }
  // A regra vale no servidor: esconder o botão na tela não basta.
  if (horarioJaPassou(data, hora)) {
    return res.status(400).json({ erro: "Esse dia ou horário já passou. Escolha um horário futuro." });
  }
  if (typeof paciente !== "string" || paciente.trim() === "" || paciente.trim().length > 100) {
    return res.status(400).json({ erro: "Informe o nome do paciente (até 100 caracteres)." });
  }
  const digitosCelular = normalizarCelular(celular);
  if (digitosCelular === null) {
    return res.status(400).json({ erro: "Informe um celular válido, com DDD (10 ou 11 dígitos)." });
  }

  const dia = nomeDiaSemana(data);
  if (!banco.horarioExisteNaGrade(dia, hora)) {
    return res.status(400).json({ erro: "A clínica não atende nesse dia/horário." });
  }

  // O banco recusa (chave primária) se o horário já estiver ocupado.
  const resultado = banco.criarAgendamento({
    id: `${data}_${hora}`,
    data,
    dia,
    hora,
    paciente: paciente.trim(),
    celular: digitosCelular,
  });

  if (!resultado.ok) {
    return res.status(409).json({ erro: "Esse horário já foi agendado por outra pessoa." });
  }
  res.status(200).json({ mensagem: "Consulta agendada com sucesso!", agendamento: resultado.agendamento });
});

// POST /api/cancelar  { id, codigo }
// Só cancela quem tem o código recebido ao agendar. Mesma resposta (404) para
// "não existe" e "código errado", para não revelar quais horários estão ocupados.
app.post("/api/cancelar", (req, res) => {
  const { id, codigo } = req.body || {};

  if (typeof id !== "string" || id === "" || typeof codigo !== "string" || codigo === "") {
    return res.status(400).json({ erro: "Informe qual agendamento cancelar e o código dele." });
  }
  if (!banco.removerAgendamento(id, codigo)) {
    return res.status(404).json({ erro: "Agendamento não encontrado." });
  }
  res.status(200).json({ mensagem: "Agendamento cancelado." });
});

// Só abre a porta quando o arquivo é executado direto (npm start). Nos testes,
// o app é importado e iniciado pelo próprio teste.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
