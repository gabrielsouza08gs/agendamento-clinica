// regras.js
// Regras de negócio puras (datas, horários e celular), SEM Express e SEM banco.
// Ficam separadas do server.js para poderem ser testadas sozinhas (npm test).

const NOMES_DIAS = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
];

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

// Formata um Date como "AAAA-MM-DD" no horário local
// (evita o fuso horário empurrar a data para o dia anterior).
function formatarISO(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// true se for uma data real do calendário (rejeita "2026-02-31", por exemplo).
function dataValida(dataISO) {
  if (typeof dataISO !== "string" || !REGEX_DATA.test(dataISO)) return false;
  const d = new Date(dataISO + "T00:00:00");
  return !Number.isNaN(d.getTime()) && formatarISO(d) === dataISO;
}

function nomeDiaSemana(dataISO) {
  return NOMES_DIAS[new Date(dataISO + "T00:00:00").getDay()];
}

// Segunda-feira da semana de atendimento que contém a data.
// Sábado e domingo mostram a semana SEGUINTE (a clínica não atende no fim de
// semana, então a semana útil que interessa é a próxima).
function segundaDaSemana(dataISO) {
  const data = new Date(dataISO + "T00:00:00");
  const diaSemana = data.getDay(); // 0 = domingo ... 6 = sábado
  let deslocamento;
  if (diaSemana === 0) deslocamento = 1;
  else if (diaSemana === 6) deslocamento = 2;
  else deslocamento = 1 - diaSemana;
  const segunda = new Date(data);
  segunda.setDate(data.getDate() + deslocamento);
  return segunda;
}

// Os 5 dias úteis (segunda a sexta) da semana que contém a data-âncora.
function gerarDiasUteis(dataAncoraISO) {
  const segunda = segundaDaSemana(dataAncoraISO);
  const dias = [];
  for (let i = 0; i < 5; i++) {
    const data = new Date(segunda);
    data.setDate(segunda.getDate() + i);
    const dataISO = formatarISO(data);
    dias.push({ data: dataISO, dia: nomeDiaSemana(dataISO) });
  }
  return dias;
}

// true se o dia/horário já passou. Um horário de hoje que já começou também
// conta como passado. "agora" pode ser informado para facilitar os testes.
function horarioJaPassou(dataISO, hora, agora = new Date()) {
  const hoje = formatarISO(agora);
  if (dataISO < hoje) return true;
  if (dataISO > hoje) return false;
  const agoraHHMM =
    `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  return hora <= agoraHHMM;
}

// Celular brasileiro: DDD + 8 ou 9 dígitos (10 ou 11 dígitos no total).
// Devolve só os dígitos, ou null se o número for inválido.
function normalizarCelular(celular) {
  if (typeof celular !== "string" && typeof celular !== "number") return null;
  const digitos = String(celular).replace(/\D/g, "");
  return digitos.length === 10 || digitos.length === 11 ? digitos : null;
}

module.exports = {
  NOMES_DIAS,
  REGEX_DATA,
  REGEX_HORA,
  formatarISO,
  dataValida,
  nomeDiaSemana,
  segundaDaSemana,
  gerarDiasUteis,
  horarioJaPassou,
  normalizarCelular,
};
