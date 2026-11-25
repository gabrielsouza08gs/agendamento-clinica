// test/regras.test.js
// Testes das regras puras (datas, horários passados e celular). Sem servidor e sem banco.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  dataValida,
  segundaDaSemana,
  gerarDiasUteis,
  formatarISO,
  horarioJaPassou,
  normalizarCelular,
} = require("../regras");

// "Agora" fixo para os testes não dependerem do relógio: quarta, 18/11/2026, 14:30.
const AGORA = new Date(2026, 10, 18, 14, 30);

test("dataValida recusa datas que não existem no calendário", () => {
  assert.equal(dataValida("2026-11-18"), true);
  assert.equal(dataValida("2026-02-31"), false);
  assert.equal(dataValida("18/11/2026"), false);
  assert.equal(dataValida(undefined), false);
  assert.equal(dataValida(["2026-11-18"]), false);
});

test("dias anteriores a hoje já passaram", () => {
  assert.equal(horarioJaPassou("2026-11-09", "09:00", AGORA), true);
  assert.equal(horarioJaPassou("2026-11-17", "17:00", AGORA), true);
});

test("dias depois de hoje ainda não passaram", () => {
  assert.equal(horarioJaPassou("2026-11-19", "09:00", AGORA), false);
  assert.equal(horarioJaPassou("2027-01-04", "09:00", AGORA), false);
});

test("hoje: horários que já começaram passaram, os próximos não", () => {
  assert.equal(horarioJaPassou("2026-11-18", "09:00", AGORA), true);
  assert.equal(horarioJaPassou("2026-11-18", "14:00", AGORA), true);
  assert.equal(horarioJaPassou("2026-11-18", "15:00", AGORA), false);
});

test("celular válido tem DDD + 8 ou 9 dígitos e volta só com dígitos", () => {
  assert.equal(normalizarCelular("(27) 99999-8888"), "27999998888");
  assert.equal(normalizarCelular("2733334444"), "2733334444");
});

test("celular incompleto ou longo demais é recusado", () => {
  assert.equal(normalizarCelular("12345678"), null); // 8 dígitos (caso do relatório)
  assert.equal(normalizarCelular("(12) 34567-8"), null);
  assert.equal(normalizarCelular("279999988889"), null); // 12 dígitos
  assert.equal(normalizarCelular(""), null);
  assert.equal(normalizarCelular(undefined), null);
  assert.equal(normalizarCelular({}), null);
});

test("a semana de quarta-feira começa na segunda anterior", () => {
  assert.equal(formatarISO(segundaDaSemana("2026-11-18")), "2026-11-16");
});

test("sábado e domingo mostram a semana seguinte", () => {
  assert.equal(formatarISO(segundaDaSemana("2026-11-14")), "2026-11-16"); // sábado
  assert.equal(formatarISO(segundaDaSemana("2026-11-15")), "2026-11-16"); // domingo
});

test("gerarDiasUteis devolve segunda a sexta", () => {
  const dias = gerarDiasUteis("2026-11-18");
  assert.equal(dias.length, 5);
  assert.equal(dias[0].data, "2026-11-16");
  assert.equal(dias[0].dia, "Segunda-feira");
  assert.equal(dias[4].data, "2026-11-20");
  assert.equal(dias[4].dia, "Sexta-feira");
});
