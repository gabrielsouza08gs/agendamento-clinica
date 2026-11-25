// test/db.test.js
// Testes do banco SQLite, usando um banco só em memória (não mexe em data/clinica.db).

process.env.DB_PATH = ":memory:";

const test = require("node:test");
const assert = require("node:assert/strict");

const banco = require("../db");

function consulta(id, extra = {}) {
  const [data, hora] = id.split("_");
  return { id, data, dia: "Segunda-feira", hora, paciente: "Paciente Teste", celular: "27999998888", ...extra };
}

test("a grade de horários é carregada no primeiro uso", () => {
  assert.ok(banco.obterGrade().length > 0);
  assert.ok(banco.horarioExisteNaGrade("Segunda-feira", "09:00"));
  assert.equal(banco.horarioExisteNaGrade("Domingo", "09:00"), false);
});

test("o banco não deixa dois pacientes no mesmo horário", () => {
  const primeiro = banco.criarAgendamento(consulta("2030-03-04_09:00"));
  const segundo = banco.criarAgendamento(consulta("2030-03-04_09:00"));
  assert.equal(primeiro.ok, true);
  assert.equal(segundo.ok, false);
  assert.equal(segundo.motivo, "ocupado");
});

test("cada agendamento recebe um código aleatório diferente", () => {
  const a = banco.criarAgendamento(consulta("2030-03-04_10:00"));
  const b = banco.criarAgendamento(consulta("2030-03-04_11:00"));
  assert.ok(a.agendamento.codigo.length >= 32);
  assert.notEqual(a.agendamento.codigo, b.agendamento.codigo);
});

test("só cancela quem tem o código certo", () => {
  const { agendamento } = banco.criarAgendamento(consulta("2030-03-04_12:00"));

  assert.equal(banco.removerAgendamento(agendamento.id, "codigo-errado"), false);
  assert.ok(banco.idsOcupados("2030-03-04", "2030-03-04").has(agendamento.id), "continua agendado");

  assert.equal(banco.removerAgendamento(agendamento.id, agendamento.codigo), true);
  assert.equal(banco.idsOcupados("2030-03-04", "2030-03-04").has(agendamento.id), false);
});

test("a busca devolve só as consultas cujo id e código batem, sem celular nem código", () => {
  const minha = banco.criarAgendamento(consulta("2030-03-05_09:00", { paciente: "Minha Consulta" }));
  const alheia = banco.criarAgendamento(consulta("2030-03-05_10:00", { paciente: "Consulta Alheia" }));

  const achadas = banco.buscarAgendamentosDoPaciente([
    { id: minha.agendamento.id, codigo: minha.agendamento.codigo },
    { id: alheia.agendamento.id, codigo: "chute" }, // código errado
  ]);

  assert.equal(achadas.length, 1);
  assert.equal(achadas[0].paciente, "Minha Consulta");
  assert.equal("celular" in achadas[0], false);
  assert.equal("codigo" in achadas[0], false);
});

test("texto com SQL malicioso é salvo como texto comum (consulta parametrizada)", () => {
  const nome = "x'); DROP TABLE agendamentos; --";
  const { agendamento } = banco.criarAgendamento(consulta("2030-03-06_09:00", { paciente: nome }));

  const [achada] = banco.buscarAgendamentosDoPaciente([{ id: agendamento.id, codigo: agendamento.codigo }]);
  assert.equal(achada.paciente, nome);
  assert.ok(banco.idsOcupados("2030-03-06", "2030-03-06").has(agendamento.id), "a tabela continua lá");
});
