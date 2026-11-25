// test/api.test.js
// Testes da API e das páginas, com o servidor de verdade (Express) subindo numa
// porta livre e um banco só em memória. Cada teste do Teste Cruzado que foi
// corrigido tem aqui o teste que prova a correção.

process.env.DB_PATH = ":memory:";

const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../server");

let servidor;
let base;

test.before(async () => {
  servidor = app.listen(0);
  await new Promise((resolver) => servidor.once("listening", resolver));
  base = `http://localhost:${servidor.address().port}`;
});

test.after(() => servidor.close());

// ---------- Utilidades ----------

function formatarISO(date) {
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mes}-${dia}`;
}

// Um dia útil (segunda a sexta) daqui a pelo menos "diasAFrente" dias.
// Cada teste usa um valor diferente para não disputar o mesmo horário.
function diaUtilFuturo(diasAFrente) {
  const data = new Date();
  data.setDate(data.getDate() + diasAFrente);
  while (data.getDay() === 0 || data.getDay() === 6) data.setDate(data.getDate() + 1);
  return formatarISO(data);
}

async function post(caminho, corpo) {
  const resposta = await fetch(base + caminho, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

function agendar(data, hora, extra = {}) {
  return post("/api/agendar", {
    data, hora, paciente: "Paciente Teste", celular: "(27) 99999-8888", ...extra,
  });
}

// ---------- Falha C: validações que faltavam no servidor ----------

test("o servidor recusa agendar em data que já passou", async () => {
  const r = await agendar("2020-01-06", "09:00");
  assert.equal(r.status, 400);
  assert.match(r.corpo.erro, /passou/);
});

test("o servidor recusa celular com menos de 10 dígitos", async () => {
  const r = await agendar(diaUtilFuturo(20), "09:00", { celular: "12345678" });
  assert.equal(r.status, 400);
  assert.match(r.corpo.erro, /celular/i);
});

test("o servidor recusa nome só com espaços", async () => {
  const r = await agendar(diaUtilFuturo(20), "09:00", { paciente: "   " });
  assert.equal(r.status, 400);
});

test("o servidor recusa horário fora da grade da clínica", async () => {
  const r = await agendar(diaUtilFuturo(20), "03:00");
  assert.equal(r.status, 400);
});

// ---------- Agendamento ----------

test("agendar devolve um código secreto e não devolve o celular", async () => {
  const r = await agendar(diaUtilFuturo(21), "09:00");
  assert.equal(r.status, 200);
  assert.ok(r.corpo.agendamento.codigo.length >= 32);
  assert.equal("celular" in r.corpo.agendamento, false);
});

test("o mesmo horário não pode ser agendado duas vezes (409)", async () => {
  const data = diaUtilFuturo(22);
  assert.equal((await agendar(data, "10:00")).status, 200);
  assert.equal((await agendar(data, "10:00")).status, 409);
});

// ---------- Falha B: cancelar a consulta dos outros ----------

test("cancelar sem o código é recusado e a consulta continua agendada", async () => {
  const data = diaUtilFuturo(23);
  const { corpo } = await agendar(data, "11:00");
  const id = corpo.agendamento.id;

  assert.equal((await post("/api/cancelar", { id })).status, 400);
  assert.equal((await post("/api/cancelar", { id, codigo: "chute" })).status, 404);

  // continua ocupado: tentar agendar de novo dá 409
  assert.equal((await agendar(data, "11:00")).status, 409);
});

test("cancelar com o código certo funciona e libera o horário", async () => {
  const data = diaUtilFuturo(24);
  const { corpo } = await agendar(data, "12:00");
  const { id, codigo } = corpo.agendamento;

  assert.equal((await post("/api/cancelar", { id, codigo })).status, 200);
  assert.equal((await agendar(data, "12:00")).status, 200);
});

// ---------- Falha A: dados de todos os pacientes abertos ----------

test("não existe mais a rota que lista todos os agendamentos", async () => {
  const resposta = await fetch(base + "/api/agendamentos");
  assert.equal(resposta.status, 404);
});

test("Meus Agendamentos devolve só as consultas do próprio paciente, sem celular", async () => {
  const data = diaUtilFuturo(25);
  const minha = (await agendar(data, "09:00", { paciente: "Dona da Consulta" })).corpo.agendamento;
  await agendar(data, "10:00", { paciente: "Outra Pessoa" });

  const r = await post("/api/meus-agendamentos", {
    consultas: [{ id: minha.id, codigo: minha.codigo }, { id: `${data}_10:00`, codigo: "chute" }],
  });

  assert.equal(r.status, 200);
  assert.equal(r.corpo.length, 1);
  assert.equal(r.corpo[0].paciente, "Dona da Consulta");
  assert.equal("celular" in r.corpo[0], false);
  assert.equal("codigo" in r.corpo[0], false);
});

test("Meus Agendamentos sem lista de consultas responde 400", async () => {
  assert.equal((await post("/api/meus-agendamentos", {})).status, 400);
});

// ---------- Dias passados, semanas e fim de semana ----------

test("semana passada vem toda indisponível e sem botão de voltar", async () => {
  const r = await (await fetch(base + "/api/horarios?data=2020-01-08")).json();
  assert.equal(r.semana.podeVoltar, false);
  for (const dia of r.dias) {
    assert.equal(dia.passado, true);
    assert.ok(dia.horarios.every((h) => h.disponivel === false));
  }
});

test("uma semana futura tem horários livres e permite voltar", async () => {
  const r = await (await fetch(base + `/api/horarios?data=${diaUtilFuturo(60)}`)).json();
  assert.equal(r.semana.podeVoltar, true);
  assert.ok(r.dias.some((d) => d.horarios.some((h) => h.disponivel)));
});

test("domingo mostra a semana seguinte (segunda a sexta)", async () => {
  const r = await (await fetch(base + "/api/horarios?data=2026-11-15")).json(); // domingo
  assert.equal(r.semana.inicio, "2026-11-16");
  assert.equal(r.semana.fim, "2026-11-20");
});

test("data inválida em /api/horarios responde 400, não quebra", async () => {
  const resposta = await fetch(base + "/api/horarios?data=0002-11-24x");
  assert.equal(resposta.status, 400);
  assert.ok((await resposta.json()).erro);
});

// ---------- Páginas e conteúdo semântico (itens 7 e 8) ----------

test("a página inicial é indexável e tem JSON-LD do tipo Dentist", async () => {
  const html = await (await fetch(base + "/")).text();
  assert.match(html, /<meta name="robots" content="index, follow">/);
  assert.match(html, /"@type": "Dentist"/);
  assert.match(html, /rel="icon"/);
});

test("Meus Agendamentos tem noindex e não tem JSON-LD", async () => {
  const html = await (await fetch(base + "/meus-agendamentos")).text();
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /application\/ld\+json/);
});

test("robots.txt e sitemap.xml respondem", async () => {
  const robots = await (await fetch(base + "/robots.txt")).text();
  assert.match(robots, /Disallow: \/meus-agendamentos/);
  const mapa = await fetch(base + "/sitemap.xml");
  assert.equal(mapa.status, 200);
});
