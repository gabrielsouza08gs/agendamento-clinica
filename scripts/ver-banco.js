// scripts/ver-banco.js  (npm run banco)
// Mostra no terminal o conteúdo das tabelas do SQLite, para conferir os dados
// sem abrir nenhuma ferramenta extra. Só leitura. O código secreto de cada
// consulta não é impresso.

const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const caminho = process.env.DB_PATH || path.join(__dirname, "..", "data", "clinica.db");
const db = new DatabaseSync(caminho, { readOnly: true });

console.log(`Banco: ${caminho}\n`);

const grade = db.prepare("SELECT COUNT(*) AS horarios_na_grade FROM grade_horarios").get();
console.log(grade);

console.log("\nAgendamentos:");
console.table(
  db
    .prepare("SELECT id, data, dia, hora, paciente, status FROM agendamentos ORDER BY data, hora")
    .all()
);
