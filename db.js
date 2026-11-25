// db.js
// Camada de acesso ao banco de dados (SQLite).
//
// Usamos o módulo "node:sqlite", que já vem dentro do Node.js (22.13 ou mais
// novo) — não precisa instalar nada além do Express.
//
// SEGURANÇA: todo valor vindo do usuário entra no SQL por meio de PARÂMETROS
// (os "?" nas consultas). O texto digitado nunca é colado dentro da string
// SQL, então não vira comando. Esse é o conceito de consulta parametrizada
// que se opõe à injeção de SQL (aula do item 8).

const { DatabaseSync } = require("node:sqlite");
const { randomUUID } = require("node:crypto");
const fs = require("fs");
const path = require("path");

// DB_PATH permite trocar o arquivo do banco (os testes usam ":memory:").
const CAMINHO_BANCO = process.env.DB_PATH || path.join(__dirname, "data", "clinica.db");
const CAMINHO_GRADE_JSON = path.join(__dirname, "data", "horarios.json");
const CAMINHO_AGENDAMENTOS_JSON = path.join(__dirname, "data", "agendamentos.json");

const db = new DatabaseSync(CAMINHO_BANCO);

// ---------- Estrutura (tabelas e colunas) ----------

db.exec(`
  PRAGMA journal_mode = WAL;

  -- GRADE FIXA: quais dias da semana e horários a clínica atende.
  CREATE TABLE IF NOT EXISTS grade_horarios (
    dia   TEXT NOT NULL,   -- ex.: 'Segunda-feira'
    hora  TEXT NOT NULL,   -- ex.: '09:00'
    PRIMARY KEY (dia, hora)
  );

  -- AGENDAMENTOS: cada consulta marcada, amarrada a uma data real.
  -- A chave primária (id = 'AAAA-MM-DD_HH:MM') impede, no próprio banco,
  -- que dois pacientes marquem o mesmo horário.
  -- "codigo" é um segredo aleatório entregue só a quem agendou: sem ele não
  -- dá para ver nem cancelar a consulta (Teste Cruzado, falhas A e B).
  CREATE TABLE IF NOT EXISTS agendamentos (
    id        TEXT PRIMARY KEY,
    data      TEXT NOT NULL,     -- 'AAAA-MM-DD'
    dia       TEXT NOT NULL,     -- dia da semana por extenso
    hora      TEXT NOT NULL,     -- 'HH:MM'
    paciente  TEXT NOT NULL,
    celular   TEXT NOT NULL,     -- só dígitos
    status    TEXT NOT NULL DEFAULT 'Agendado',
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    codigo    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos (data);
`);

// Bancos criados antes desta versão não têm a coluna "codigo": adiciona.
const colunas = db.prepare("PRAGMA table_info(agendamentos)").all().map((c) => c.name);
if (!colunas.includes("codigo")) {
  db.exec("ALTER TABLE agendamentos ADD COLUMN codigo TEXT");
}

// ---------- Carga inicial (só na primeira vez que o banco é criado) ----------
// Aproveita os dados que antes ficavam nos arquivos JSON.

function lerJSONSeExistir(caminho) {
  if (!fs.existsSync(caminho)) return [];
  return JSON.parse(fs.readFileSync(caminho, "utf-8"));
}

const inserirGrade = db.prepare(
  "INSERT OR IGNORE INTO grade_horarios (dia, hora) VALUES (?, ?)"
);
const inserirAgendamento = db.prepare(
  `INSERT OR IGNORE INTO agendamentos (id, data, dia, hora, paciente, celular, status, codigo)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

if (db.prepare("SELECT COUNT(*) AS n FROM grade_horarios").get().n === 0) {
  for (const h of lerJSONSeExistir(CAMINHO_GRADE_JSON)) {
    inserirGrade.run(h.dia, h.hora);
  }
  for (const a of lerJSONSeExistir(CAMINHO_AGENDAMENTOS_JSON)) {
    inserirAgendamento.run(
      a.id, a.data, a.dia, a.hora, a.paciente,
      String(a.celular).replace(/\D/g, ""), a.status || "Agendado", randomUUID()
    );
  }
}

// Agendamentos que já existiam sem código recebem um código aleatório que
// ninguém conhece: ficam protegidos (só dá para mexer neles direto no banco).
const semCodigo = db.prepare("SELECT id FROM agendamentos WHERE codigo IS NULL").all();
const definirCodigo = db.prepare("UPDATE agendamentos SET codigo = ? WHERE id = ?");
for (const { id } of semCodigo) {
  definirCodigo.run(randomUUID(), id);
}

// ---------- Operações (todas parametrizadas) ----------

const ORDEM_DIAS_SQL = `CASE dia
  WHEN 'Segunda-feira' THEN 1 WHEN 'Terça-feira' THEN 2 WHEN 'Quarta-feira' THEN 3
  WHEN 'Quinta-feira' THEN 4 WHEN 'Sexta-feira' THEN 5 ELSE 6 END`;

const stmtGrade = db.prepare(
  `SELECT dia, hora FROM grade_horarios ORDER BY ${ORDEM_DIAS_SQL}, hora`
);
const stmtHorariosDoDia = db.prepare(
  "SELECT hora FROM grade_horarios WHERE dia = ? ORDER BY hora"
);
const stmtHorarioExiste = db.prepare(
  "SELECT 1 AS ok FROM grade_horarios WHERE dia = ? AND hora = ?"
);
const stmtOcupadosNoPeriodo = db.prepare(
  "SELECT id FROM agendamentos WHERE data BETWEEN ? AND ?"
);
// Só devolve a consulta quando id E código batem. Não traz celular nem código.
const stmtDoPaciente = db.prepare(
  `SELECT id, data, dia, hora, paciente, status
   FROM agendamentos WHERE id = ? AND codigo = ?`
);
const stmtInserir = db.prepare(
  `INSERT INTO agendamentos (id, data, dia, hora, paciente, celular, status, codigo)
   VALUES (?, ?, ?, ?, ?, ?, 'Agendado', ?)`
);
const stmtRemover = db.prepare("DELETE FROM agendamentos WHERE id = ? AND codigo = ?");
const stmtContarFuturos = db.prepare(
  "SELECT COUNT(*) AS n FROM agendamentos WHERE data >= ?"
);

function obterGrade() {
  return stmtGrade.all();
}

function obterHorariosDoDia(dia) {
  return stmtHorariosDoDia.all(dia).map((r) => r.hora);
}

function horarioExisteNaGrade(dia, hora) {
  return stmtHorarioExiste.get(dia, hora) !== undefined;
}

// Devolve um Set com os ids ('AAAA-MM-DD_HH:MM') ocupados entre duas datas.
function idsOcupados(dataInicio, dataFim) {
  return new Set(stmtOcupadosNoPeriodo.all(dataInicio, dataFim).map((r) => r.id));
}

// Recebe [{ id, codigo }, ...] e devolve só as consultas cujo par bate.
// Não existe função que liste todos os pacientes: ninguém vê dados de outros.
function buscarAgendamentosDoPaciente(pares) {
  const encontrados = [];
  for (const { id, codigo } of pares) {
    const linha = stmtDoPaciente.get(id, codigo);
    if (linha) encontrados.push({ ...linha });
  }
  return encontrados.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
}

// Devolve { ok: true, agendamento } ou { ok: false, motivo: "ocupado" }.
// O código secreto é gerado aqui, com aleatoriedade criptográfica.
function criarAgendamento({ id, data, dia, hora, paciente, celular }) {
  const codigo = randomUUID();
  try {
    stmtInserir.run(id, data, dia, hora, paciente, celular, codigo);
  } catch (erro) {
    if (/UNIQUE|PRIMARY KEY/i.test(String(erro.message))) {
      return { ok: false, motivo: "ocupado" };
    }
    throw erro;
  }
  return { ok: true, agendamento: { id, data, dia, hora, paciente, status: "Agendado", codigo } };
}

// Devolve true se removeu alguma linha (id e código precisam bater).
function removerAgendamento(id, codigo) {
  return stmtRemover.run(id, codigo).changes > 0;
}

function contarAgendamentosFuturos(dataHojeISO) {
  return stmtContarFuturos.get(dataHojeISO).n;
}

module.exports = {
  obterGrade,
  obterHorariosDoDia,
  horarioExisteNaGrade,
  idsOcupados,
  buscarAgendamentosDoPaciente,
  criarAgendamento,
  removerAgendamento,
  contarAgendamentosFuturos,
};
