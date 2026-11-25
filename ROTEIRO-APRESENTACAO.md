# Roteiro — Checkpoint 2 (≈10 min, todos falam)

**1. Abertura (1 min) — pessoa 1.** O que é o projeto (agendamento da Clínica Sorriso Saudável) e o que mudou desde o Checkpoint 1: agora usa banco SQLite e gera conteúdo semântico a partir dos dados.

**2. Item 8 — Banco de dados (4 min) — pessoa 2.**
1. Abrir `db.js` e mostrar as duas tabelas e as colunas (`grade_horarios`, `agendamentos`).
2. Ao vivo: agendar uma consulta pela tela → ir em "Meus Agendamentos" e mostrar o registro → rodar o comando de `SELECT` do LEIA-ME e mostrar a linha no banco.
3. Cancelar → mostrar que sumiu do banco e que o horário voltou a ficar livre.
4. Segurança: mostrar um `prepare("... WHERE id = ?")` e explicar que o texto digitado vai como parâmetro. Demonstração: agendar com o nome `x'); DROP TABLE agendamentos;--` — é salvo como texto e a tabela continua lá.
5. Tentar agendar o mesmo horário duas vezes: o banco recusa (chave primária) e aparece "já foi agendado".

**3. Item 7 — Conteúdo semântico (4 min) — pessoa 3.**
1. Ctrl+U na página inicial: mostrar `<title>`, `description`, Open Graph e o bloco JSON-LD. Explicar que tudo é gerado em `seo.js` a partir da grade do banco, não escrito à mão.
2. Provar a geração: agendar até mudar o número de vagas, ou alterar um horário em `grade_horarios`, e recarregar. A descrição muda sozinha.
3. Ctrl+U em `/meus-agendamentos`: título diferente e `noindex`.
4. Rodar o Lighthouse do Chrome (F12 → Lighthouse → Accessibility e SEO). O Rich Results Test do Google só funciona com URL pública.
5. Acessibilidade: navegar com Tab (link "pular para o conteúdo", foco visível), mostrar `<label for>` nos campos e `aria-current`.

**4. Fechamento (1 min) — pessoa 1.** O que ainda falta (lembretes por e-mail/WhatsApp, painel da recepção, login) e perguntas.

## Perguntas prováveis
- *Por que SQLite?* Banco relacional de arquivo único, já vem no Node, sem servidor para instalar.
- *O que é consulta parametrizada?* O SQL e os valores vão separados; o valor nunca é interpretado como comando.
- *Por que o `<head>` é gerado no servidor?* Buscadores e prévias de redes sociais leem o HTML recebido, sem rodar JavaScript.
- *Por que `noindex` em Meus Agendamentos?* A página lista dados de pacientes.
