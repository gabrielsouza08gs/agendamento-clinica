# Roteiro — Checkpoint Final (~10 minutos, 3 pessoas)

Todos falam. Sugestão de divisão: **Pessoa 1** abre e faz o Item 9;
**Pessoa 2** mostra as falhas de segurança (A, B, C); **Pessoa 3** mostra as
correções de uso, o que ficou de fora e fecha.

## Antes de começar

- Guarde uma cópia do projeto do Checkpoint 2 (a pasta antiga, ou um commit
  com `git tag checkpoint2`) para mostrar o **"antes"**.
- Terminal aberto na pasta do projeto; navegador com `localhost:3000`.
- Repositório no GitHub com a aba **Actions** aberta e o último teste verde.
- Para a demonstração das falhas, abra o projeto antigo numa **porta diferente**:
  `PORT=3001 npm start` (no PowerShell: `$env:PORT=3001; npm start`).

## 1. Abertura (Pessoa 1, ~0:30)

"Neste checkpoint aplicamos ao nosso projeto a automação da construção e as
melhorias a partir do relatório que o outro grupo fez sobre o nosso sistema."

## 2. Item 9 — Automação (Pessoa 1, ~3:30)

1. **README:** abrir o `LEIA-ME.md` e mostrar o quadro de comandos.
2. **Scripts:** abrir o `package.json` — `start`, `dev`, `test`, `banco`.
3. **Ao vivo:** `npm install`, `npm start` (mostrar a página abrindo), `Ctrl + C`.
4. **Testes:** `npm test` — mostrar os 33 testes passando.
5. **Integração contínua:** abrir `.github/workflows/test.yml` e, no GitHub,
   a aba **Actions** com o teste verde do último `push`.

Fala: "Quem nunca viu o projeto roda com `npm install` e `npm start`. Os testes
rodam com `npm test`, e o GitHub Actions roda esses testes sozinho a cada envio
ao repositório."

## 3. Falhas de segurança (Pessoa 2, ~3:00)

Para cada falha: **antes** (projeto antigo, porta 3001) e **depois** (novo, 3000).

| Falha | Antes | Depois |
|---|---|---|
| **C — data passada** | Agendar em 09/11 → "Consulta agendada" | O botão do dia já vem desabilitado; pela API (`/api/agendar` com data passada) o servidor responde 400 |
| **A — dados abertos** | `/meus-agendamentos` lista todos; F12 → Rede mostra o celular | A rota `/api/agendamentos` não existe mais (404); a lista mostra só as consultas deste navegador |
| **B — cancelar a consulta dos outros** | Cancelar a consulta de outra pessoa apaga do banco | Cancelar exige `id` + código aleatório; sem o código o servidor responde 404. Mostrar o teste `cancelar sem o código é recusado` |

Fala: "O relatório mostrou que a validação precisa estar no servidor, não só na
tela. Por isso o servidor agora recusa datas passadas, e o cancelamento exige
um código aleatório gerado com `crypto.randomUUID()`."

## 4. Melhorias de uso (Pessoa 3, ~2:00)

- **Clique duplo:** clicar rápido em "Confirmar" → o botão vira "Enviando..." e
  termina em sucesso.
- **Resumo no topo:** "Consulta marcada para …, às …".
- **Cancelar:** botões "Manter consulta" / "Sim, cancelar consulta" e a mensagem
  "Agendamento cancelado.".
- **Contraste:** rodar o Lighthouse de novo na página inicial e mostrar o
  resultado real (o aviso de contraste que tirava pontos deve ter sumido; se
  aparecer outro aviso, explique qual é).

## 5. O que não fizemos e fechamento (Pessoa 3, ~1:00)

"Não implementamos o login completo: exige usuários, senhas com hash e sessões.
Como mitigação, ninguém mais vê os dados dos outros e o cancelamento exige um
código. O limite é que o código fica só neste navegador. Também deixamos de
fora o histórico de consultas canceladas e a imagem de prévia do WhatsApp, que
dependem de mudança no modelo de dados e de uma imagem da clínica. O próximo
passo é o login."

## Se perguntarem

- **Por que `npm test` e não outra ferramenta?** O Node já traz o `node:test`;
  não precisamos instalar nada.
- **O que o GitHub Actions faz?** Instala o projeto do zero e roda os testes a
  cada `push`; se um teste falhar, o envio fica marcado com ❌.
- **Por que o código fica no navegador?** Sem login, o navegador é o único lugar
  onde o paciente "se identifica". Quem limpar os dados perde o acesso pela tela;
  com login, isso se resolve.
- **Os dados de antes ainda existem?** Sim, mas as consultas antigas receberam um
  código que ninguém conhece, então ficam protegidas.
- **Qual parte foi feita com apoio de IA?** Seja honesto: leia o código das
  rotas `/api/agendar` e `/api/cancelar` antes da apresentação para conseguir
  explicar cada linha.
