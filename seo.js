// seo.js
// Geração do CONTEÚDO SEMÂNTICO das páginas (item 7 da ementa).
//
// Nada aqui é escrito à mão página por página: título, descrição, Open Graph
// e os dados estruturados (JSON-LD, vocabulário schema.org) são MONTADOS a
// partir dos dados que vêm do banco — a grade de horários e os agendamentos.
// Se a clínica mudar o horário de atendimento no banco, as páginas passam a
// dizer o novo horário sem ninguém editar HTML.

const CLINICA = {
  nome: "Clínica Sorriso Saudável",
  tipo: "Dentist", // tipo do schema.org
  // Opcionais: se forem preenchidos, entram no JSON-LD automaticamente.
  telefone: null, // ex.: "+55 27 99999-9999"
  endereco: null, // ex.: { rua: "Rua X, 123", cidade: "Vitória", estado: "ES", cep: "29000-000" }
};

const DIAS_SCHEMA = {
  "Segunda-feira": "Monday",
  "Terça-feira": "Tuesday",
  "Quarta-feira": "Wednesday",
  "Quinta-feira": "Thursday",
  "Sexta-feira": "Friday",
  "Sábado": "Saturday",
  "Domingo": "Sunday",
};

// ---------- Utilidades ----------

function escaparHTML(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Dentro de <script type="application/ld+json">, "<" precisa ser escapado
// para que nenhum texto consiga "fechar" a tag <script> (proteção contra XSS).
function jsonSeguro(objeto) {
  return JSON.stringify(objeto, null, 2).replace(/</g, "\\u003c");
}

function somar60Minutos(hora) {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + 60;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Da grade [{dia, hora}, ...] tira o expediente de cada dia: abre no primeiro
// horário e fecha 1h depois do último (cada consulta dura 1 hora).
function expedientePorDia(grade) {
  const porDia = new Map();
  for (const { dia, hora } of grade) {
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(hora);
  }
  return [...porDia.entries()].map(([dia, horas]) => {
    horas.sort();
    return { dia, abre: horas[0], fecha: somar60Minutos(horas[horas.length - 1]) };
  });
}

function nomeCurtoDia(dia) {
  return dia.toLowerCase().replace("-feira", "");
}

// "de segunda a sexta, das 09:00 às 18:00" — gerado da grade.
function resumoExpediente(grade) {
  const exp = expedientePorDia(grade);
  if (exp.length === 0) return "";
  const igual = exp.every((e) => e.abre === exp[0].abre && e.fecha === exp[0].fecha);
  if (igual) {
    const primeiro = nomeCurtoDia(exp[0].dia);
    const ultimo = nomeCurtoDia(exp[exp.length - 1].dia);
    const dias = exp.length === 1 ? primeiro : `${primeiro} a ${ultimo}`;
    return `de ${dias}, das ${exp[0].abre} às ${exp[0].fecha}`;
  }
  return exp.map((e) => `${nomeCurtoDia(e.dia)} das ${e.abre} às ${e.fecha}`).join("; ");
}

// ---------- Dados por página ----------

// Cada página tem seu próprio título e descrição, montados com os dados.
function dadosDaPagina(pagina, { grade, vagasSemana }) {
  const expediente = resumoExpediente(grade);

  if (pagina === "meus-agendamentos") {
    return {
      titulo: `Meus Agendamentos — ${CLINICA.nome}`,
      descricao: `Consulte e cancele as consultas agendadas na ${CLINICA.nome}.`,
      caminho: "/meus-agendamentos",
      // Lista com dados de pacientes: não deve aparecer em buscadores.
      indexavel: false,
    };
  }

  const vagas =
    vagasSemana > 0
      ? ` Esta semana ainda há ${vagasSemana} horário${vagasSemana === 1 ? "" : "s"} livre${vagasSemana === 1 ? "" : "s"}.`
      : " Esta semana não há mais horários livres; consulte as próximas semanas.";
  return {
    titulo: `Agendar consulta odontológica online — ${CLINICA.nome}`,
    descricao: `Agende sua consulta na ${CLINICA.nome} sem ligar para a recepção. Atendimento ${expediente}.${vagas}`,
    caminho: "/",
    indexavel: true,
  };
}

// ---------- Dados estruturados (JSON-LD / schema.org) ----------

function montarJsonLd(baseUrl, grade, descricao) {
  const dados = {
    "@context": "https://schema.org",
    "@type": CLINICA.tipo,
    name: CLINICA.nome,
    description: descricao,
    url: baseUrl + "/",
    openingHoursSpecification: expedientePorDia(grade).map((e) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${DIAS_SCHEMA[e.dia]}`,
      opens: e.abre,
      closes: e.fecha,
    })),
    potentialAction: {
      "@type": "ReserveAction",
      name: "Agendar consulta",
      target: {
        "@type": "EntryPoint",
        urlTemplate: baseUrl + "/",
        actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"],
      },
      result: { "@type": "Reservation", name: "Consulta odontológica" },
    },
  };

  if (CLINICA.telefone) dados.telephone = CLINICA.telefone;
  if (CLINICA.endereco) {
    dados.address = {
      "@type": "PostalAddress",
      streetAddress: CLINICA.endereco.rua,
      addressLocality: CLINICA.endereco.cidade,
      addressRegion: CLINICA.endereco.estado,
      postalCode: CLINICA.endereco.cep,
      addressCountry: "BR",
    };
  }
  return dados;
}

// ---------- Monta o bloco de <head> da página ----------

function montarHead(pagina, { baseUrl, grade, vagasSemana }) {
  const p = dadosDaPagina(pagina, { grade, vagasSemana });
  const urlCanonica = baseUrl + p.caminho;
  const linhas = [
    `<title>${escaparHTML(p.titulo)}</title>`,
    `<meta name="description" content="${escaparHTML(p.descricao)}">`,
    `<meta name="robots" content="${p.indexavel ? "index, follow" : "noindex, nofollow"}">`,
    `<link rel="canonical" href="${escaparHTML(urlCanonica)}">`,
    `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`,
    // Open Graph: a prévia que aparece ao colar o link no WhatsApp / redes sociais
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:site_name" content="${escaparHTML(CLINICA.nome)}">`,
    `<meta property="og:title" content="${escaparHTML(p.titulo)}">`,
    `<meta property="og:description" content="${escaparHTML(p.descricao)}">`,
    `<meta property="og:url" content="${escaparHTML(urlCanonica)}">`,
    `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escaparHTML(p.titulo)}">`,
    `<meta name="twitter:description" content="${escaparHTML(p.descricao)}">`,
  ];

  // JSON-LD só na página pública (a lista de pacientes não é conteúdo público).
  if (p.indexavel) {
    linhas.push(
      `<script type="application/ld+json">\n${jsonSeguro(montarJsonLd(baseUrl, grade, p.descricao))}\n</script>`
    );
  }
  return { head: linhas.join("\n  "), titulo: p.titulo };
}

module.exports = { montarHead, escaparHTML, resumoExpediente, CLINICA };
