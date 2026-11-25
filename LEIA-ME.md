# Sistema de Agendamento — Clínica Sorriso Saudável

Sistema para o paciente marcar consulta odontológica pela internet, sem ligar
para a recepção. Feito com Node.js, Express e SQLite.

## Como rodar (do zero, em 3 comandos)

Requer **Node.js 22.13 ou mais novo** (confira com `node -v`). O banco SQLite
já vem dentro do Node (módulo `node:sqlite`), então só o Express é instalado.

```
npm install
npm start
```

Depois abra: http://localhost:3000

Na primeira execução o arquivo `data/clinica.db` é criado sozinho e recebe os
dados iniciais de `data/horarios.json` e `data/agendamentos.json`. Para zerar o
banco, pare o servidor e apague `data/clinica.db*`.

O Node mostra um aviso "ExperimentalWarning: SQLite is an experimental
feature". É normal e não afeta o funcionamento.

## Item 9 — Automação da construção

### Comandos do projeto (`package.json`)

| Comando | O que faz |
|---|---|
| `npm install` | Instala as dependências (Express) |
| `npm start` | Sobe o servidor em http://localhost:3000 |
| `npm run dev` | Sobe o servidor e reinicia sozinho quando um arquivo muda |
| `npm test` | Roda os testes automatizados |
| `npm run banco` | Mostra no terminal o conteúdo do banco SQLite |

O projeto não tem etapa de "construir" (build): o navegador recebe os arquivos
de `public/` como estão, então `npm install` + `npm start` já é tudo.

### Testes automatizados (`npm test`)

Usam o executor de testes que já vem no Node (`node:test`), sem instalar nada
a mais. Cada teste roda com um banco só em memória, sem mexer em `data/`.

- `test/regras.test.js` — datas, horários que já passaram, celular, fim de semana.
- `test/db.test.js` — banco: horário duplicado, código de cancelamento, SQL malicioso.
- `test/api.test.js` — API e páginas com o servidor de verdade: validações,
  cancelamento protegido, lista só do próprio paciente, `noindex`, JSON-LD.

### Integração contínua (GitHub Actions)

O arquivo `.github/workflows/test.yml` faz o GitHub instalar o projeto do zero
e rodar `npm test` a cada `git push`. O resultado (✅ ou ❌) aparece na aba
**Actions** do repositório.

## Melhorias a partir do Teste Cruzado

O relatório do outro grupo apontou problemas de funcionamento (1 a 6) e três
falhas de segurança (A, B e C). O que foi feito:

| Item do relatório | Antes | Depois | Teste |
|---|---|---|---|
| **Falha C / problema 1** — data passada | O servidor aceitava agendar em dia e horário que já passaram | O servidor recusa (400); a tela desabilita dias e horários passados e a seta ◀ na semana atual | `api.test.js`, `regras.test.js` |
| **Falha C / problema 4** — celular incompleto | Aceitava de 8 a 13 dígitos | Exige DDD + número (10 ou 11 dígitos) e grava só os dígitos | `api.test.js`, `regras.test.js` |
| **Falha B** — cancelar a consulta dos outros | `POST /api/cancelar` apagava qualquer `id` (que é a própria data e hora) | Ao agendar, o servidor gera um código aleatório (`crypto.randomUUID()`); cancelar exige `id` + `codigo` | `api.test.js`, `db.test.js` |
| **Falha A** — dados de todos os pacientes abertos | `GET /api/agendamentos` entregava nome e celular de todos | A rota foi removida. Meus Agendamentos pede só as consultas cujo `id` + código o navegador guardou, e a resposta não traz celular nem código | `api.test.js`, `db.test.js` |
| **Problema 2** — clique duplo | Mostrava "horário ocupado" mesmo com a consulta marcada | O botão fica desabilitado ("Enviando...") enquanto envia | testado no navegador |
| **Problema 3** — data apagada trava as setas | Erro no console e setas paradas | A resposta de erro é tratada e a seta usa a data de hoje | testado no navegador |
| **Problemas 5 e 6** — mensagens | Sucesso ficava na tela no agendamento seguinte; horário ocupado continuava habilitado | O aviso some ao começar outro agendamento; depois de "horário ocupado" a lista de horários é recarregada | testado no navegador |
| **Sugestão 5** — mensagens | Confirmação genérica; cancelar não avisava | Resumo "Consulta marcada para …, às …" no topo; "Agendamento cancelado." | testado no navegador |
| **Sugestão 6** — rótulos | "Cancelar" e "Confirmar cancelamento" | "Manter consulta" e "Sim, cancelar consulta" | testado no navegador |
| **Sugestão 8** — fim de semana | Domingo mostrava a semana que passou | Sábado e domingo mostram a semana seguinte | `api.test.js`, `regras.test.js` |
| **Sugestão 9** — contraste | Cinza `#7b8794` (3,66:1 e 2,95:1) | `#52606d` (6,46:1 e 5,2:1) | contraste calculado |
| **Sugestão 10** — foco | O foco ficava no corpo da página ao trocar de etapa | O foco vai para o título da etapa | testado no navegador |
| **Sugestão 11** — favicon | `favicon.ico` não encontrado (erro no console) | `public/favicon.svg` ligado no `<head>` | `api.test.js` |

### O que NÃO foi implementado, e por quê

- **Login e painel da recepção (falhas A e B por completo).** Um login exige
  usuários, senhas com hash e sessões: é uma mudança grande, maior do que o
  prazo permite. Como mitigação, ninguém mais lista os dados dos outros, e
  cancelar exige um código secreto. O limite que continua: o código fica só
  neste navegador (`localStorage`); quem limpar os dados do navegador perde o
  acesso às próprias consultas pela tela. O login continua sendo o próximo passo.
- **Histórico "Cancelada/Realizada" e consultas passadas separadas (sugestão 7).**
  Exige mudar o modelo de dados (status no lugar de apagar a linha) e não
  corrige nenhum erro; fica como evolução.
- **`og:image` na prévia do WhatsApp (parte da sugestão 11).** O WhatsApp não
  aceita SVG como imagem de prévia, e o projeto ainda não tem uma imagem
  própria da clínica. Telefone e endereço no JSON-LD dependem de dados reais
  (campos `telefone` e `endereco` em `CLINICA`, no `seo.js`, já prontos).

## Item 8 — Banco de dados (SQLite)

Arquivo `db.js`. Duas tabelas:

| Tabela | Colunas | Para quê |
|---|---|---|
| `grade_horarios` | `dia`, `hora` (chave: dia+hora) | Grade fixa: dias e horários que a clínica atende |
| `agendamentos` | `id` (chave, `AAAA-MM-DD_HH:MM`), `data`, `dia`, `hora`, `paciente`, `celular` (só dígitos), `status`, `criado_em`, `codigo` | Cada consulta marcada |

- Todas as consultas usam **parâmetros** (`?`), nunca texto colado no SQL —
  é a defesa contra injeção de SQL.
- A chave primária de `agendamentos` impede, no próprio banco, dois
  agendamentos no mesmo horário (o servidor responde 409).
- `codigo` é o segredo aleatório de cada consulta. Bancos criados antes desta
  versão ganham a coluna automaticamente, e as consultas antigas recebem um
  código que ninguém conhece.
- Para ver o banco pelo terminal: `npm run banco`.

## Item 7 — Conteúdo semântico gerado dos dados

- `seo.js` monta, a partir da grade do banco: `<title>`, `description`,
  `robots`, `canonical`, ícone, Open Graph, Twitter Card e **JSON-LD** (schema.org
  `Dentist` com `openingHoursSpecification` e `ReserveAction`).
- A descrição da página inicial inclui o expediente e quantos horários livres
  restam na semana (sem contar os que já passaram) — muda sozinha quando os
  dados mudam.
- Duas páginas reais, cada uma com título/descrição próprios: `/` e
  `/meus-agendamentos` (esta com `noindex`, pois é uma área pessoal).
- `/robots.txt` e `/sitemap.xml` também são gerados.
- Acessibilidade: link "pular para o conteúdo", `lang`, landmarks
  (`header`, `nav`, `main`, `footer`), `aria-current`, rótulos em todos os
  campos, `<time datetime>`, emojis decorativos com `aria-hidden`, foco visível,
  foco levado ao título a cada etapa e navegação completa pelo teclado.
- Para preencher telefone e endereço no JSON-LD, edite `CLINICA` em `seo.js`.

## Estrutura

```
server.js          rotas e API
regras.js          regras de datas, horários e celular (testáveis)
db.js              banco SQLite
seo.js             metadados e dados estruturados
views/pagina.html  modelo HTML (o servidor preenche o <head>)
public/            style.css, script.js e favicon.svg (navegador)
data/              JSONs de carga inicial + clinica.db (criado ao rodar)
scripts/           ver-banco.js (npm run banco)
test/              testes automatizados (npm test)
.github/workflows/ integração contínua (GitHub Actions)
```

## Rotas da API

| Rota | Método | Descrição |
|---|---|---|
| /api/horarios?data=AAAA-MM-DD | GET | Grade da semana que contém a data (padrão: semana atual); dias e horários passados vêm indisponíveis |
| /api/agendar | POST | Cria agendamento — { data, hora, paciente, celular }; devolve o `codigo` secreto |
| /api/meus-agendamentos | POST | Devolve as consultas cujo par { id, codigo } bate — { consultas: [{ id, codigo }] } |
| /api/cancelar | POST | Remove agendamento — { id, codigo } |
