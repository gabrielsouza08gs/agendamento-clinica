// script.js
// Roda no navegador (cliente).
//
// Duas páginas, servidas pelo servidor com o HTML já preparado (ver server.js):
//  - "/"                   -> Agendar consulta: fluxo em 3 etapas (dia -> horário -> dados),
//                             com um seletor de semana (calendário) no topo da etapa 1.
//  - "/meus-agendamentos"  -> lista as consultas marcadas NESTE navegador, com opção de cancelar.
// O servidor indica qual é a página em <body data-vista="...">.
//
// Como cada paciente só vê as próprias consultas: ao agendar, o servidor devolve
// um código secreto. O navegador guarda o par { id, codigo } (localStorage) e o
// usa para listar e cancelar. Sem o código, o servidor não entrega nem apaga nada.

// ---------- Referências aos elementos ----------

const campoData = document.getElementById("campo-data");
const botaoSemanaAnterior = document.getElementById("botao-semana-anterior");
const botaoSemanaSeguinte = document.getElementById("botao-semana-seguinte");
const textoSemanaSelecionada = document.getElementById("texto-semana-selecionada");

const secaoDias = document.getElementById("secao-dias");
const gradeDias = document.getElementById("grade-dias");
const secaoHorarios = document.getElementById("secao-horarios");
const gradeHorarios = document.getElementById("grade-horarios");
const diaSelecionadoTexto = document.getElementById("dia-selecionado-texto");
const secaoAgendamento = document.getElementById("secao-agendamento");
const resumoHorario = document.getElementById("resumo-horario-escolhido");

const formAgendamento = document.getElementById("form-agendamento");
const campoNome = document.getElementById("campo-nome");
const campoCelular = document.getElementById("campo-celular");
const botaoConfirmar = formAgendamento.querySelector('button[type="submit"]');

const botaoVoltarDias = document.getElementById("botao-voltar-dias");
const botaoVoltarHorarios = document.getElementById("botao-voltar-horarios");
const mensagemStatus = document.getElementById("mensagem-status");
const mensagemSucesso = document.getElementById("mensagem-sucesso");

const listaAgendamentos = document.getElementById("lista-agendamentos");

const passos = {
  1: document.getElementById("passo-1"),
  2: document.getElementById("passo-2"),
  3: document.getElementById("passo-3"),
};

// ---------- Estado ----------

let semanaAtual = null;        // resposta de /api/horarios (semana + dias)
let diaSelecionado = null;     // objeto { data, dia, horarios }
let horarioSelecionado = null; // objeto { id, hora }
let enviando = false;          // true enquanto o agendamento está sendo enviado

// ---------- Utilidades de data ----------

function hojeISO() {
  const agora = new Date();
  return formatarISO(agora);
}

function formatarISO(date) {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function formatarBR(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ---------- Segurança: escapar texto antes de colocar em innerHTML ----------
// Nome do paciente é digitado por usuários. Sem isto, um nome como
// <img src=x onerror=alert(1)> viraria código executado na página (XSS).

function escaparHTML(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- Mensagens na tela ----------

function mostrarMensagem(texto, tipo) {
  mensagemStatus.textContent = texto;
  mensagemStatus.className = tipo;
}

function limparMensagens() {
  mensagemStatus.textContent = "";
  mensagemStatus.className = "";
  mensagemSucesso.textContent = "";
  mensagemSucesso.hidden = true;
}

// ---------- Consultas deste navegador (id + código secreto) ----------

const CHAVE_CONSULTAS = "clinica-minhas-consultas";

function lerConsultasGuardadas() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_CONSULTAS) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch (erro) {
    return [];
  }
}

function guardarConsultas(lista) {
  try {
    localStorage.setItem(CHAVE_CONSULTAS, JSON.stringify(lista));
  } catch (erro) {
    // armazenamento indisponível (navegação privada, por exemplo): segue sem guardar
  }
}

function guardarConsulta(id, codigo) {
  const lista = lerConsultasGuardadas().filter((c) => c.id !== id);
  lista.push({ id, codigo });
  guardarConsultas(lista);
}

// ---------- ETAPA 1: seleção de semana e dia ----------

// Devolve true se a semana foi carregada; false se deu erro (e mostra o motivo).
async function carregarSemana(dataAncora) {
  let corpo = null;
  let resposta;
  try {
    resposta = await fetch(`/api/horarios?data=${encodeURIComponent(dataAncora)}`);
    corpo = await resposta.json();
  } catch (erro) {
    mostrarMensagem("Não foi possível carregar os horários. Verifique a conexão e tente de novo.", "erro");
    return false;
  }

  // Antes, uma resposta de erro era lida como se fosse a semana e travava as setas.
  if (!resposta.ok || !corpo || !corpo.semana) {
    mostrarMensagem((corpo && corpo.erro) || "Não foi possível carregar os horários.", "erro");
    return false;
  }

  semanaAtual = corpo;

  // Sábado e domingo mostram a semana seguinte; o calendário acompanha.
  const diaDaSemana = new Date(dataAncora + "T00:00:00").getDay();
  campoData.value = diaDaSemana === 0 || diaDaSemana === 6 ? semanaAtual.semana.inicio : dataAncora;

  textoSemanaSelecionada.textContent =
    `Semana de ${formatarBR(semanaAtual.semana.inicio)} a ${formatarBR(semanaAtual.semana.fim)}`;
  botaoSemanaAnterior.disabled = !semanaAtual.semana.podeVoltar; // não volta para semanas passadas

  desenharDias();
  return true;
}

function desenharDias() {
  gradeDias.innerHTML = "";

  semanaAtual.dias.forEach((diaInfo) => {
    const vagas = diaInfo.horarios.filter((h) => h.disponivel).length;

    let info = "Sem vagas";
    if (diaInfo.passado) info = "Dia já passou";
    else if (vagas > 0) info = `${vagas} horário(s) livre(s)`;

    const cartao = document.createElement("button");
    cartao.type = "button";
    cartao.className = "cartao cartao-dia";
    cartao.disabled = diaInfo.passado || vagas === 0;
    cartao.innerHTML = `
      <span class="cartao-titulo">${escaparHTML(diaInfo.dia)}</span>
      <time class="cartao-data" datetime="${escaparHTML(diaInfo.data)}">${formatarBR(diaInfo.data)}</time>
      <span class="cartao-info">${info}</span>
    `;
    cartao.addEventListener("click", () => selecionarDia(diaInfo));
    gradeDias.appendChild(cartao);
  });
}

// Data usada pelas setas: o que está no calendário, ou hoje se estiver vazio/inválido.
function dataBaseDasSetas() {
  const valor = campoData.value;
  if (!valor) return hojeISO();
  const data = new Date(valor + "T00:00:00");
  return Number.isNaN(data.getTime()) ? hojeISO() : valor;
}

function irParaSemana(deslocamentoDias) {
  const base = new Date(dataBaseDasSetas() + "T00:00:00");
  base.setDate(base.getDate() + deslocamentoDias);
  const alvo = formatarISO(base);
  carregarSemana(alvo < hojeISO() ? hojeISO() : alvo); // nunca antes de hoje
}

// Navegação rápida por semana (setas ao lado do calendário)
botaoSemanaAnterior.addEventListener("click", () => irParaSemana(-7));
botaoSemanaSeguinte.addEventListener("click", () => irParaSemana(7));

// Escolher uma data no calendário -> carrega a semana correspondente
campoData.addEventListener("change", () => {
  const valor = campoData.value;
  if (!valor) return; // campo apagado: não faz nada (as setas usam a data de hoje)

  // Enquanto o ano é digitado, passam valores incompletos (0002, 0020, 0202...).
  // Ignora até o ano ficar completo, para não enviar datas absurdas ao servidor.
  if (Number(valor.slice(0, 4)) < 1000) return;

  carregarSemana(valor < hojeISO() ? hojeISO() : valor);
});

function selecionarDia(diaInfo) {
  limparMensagens(); // começa um agendamento novo: some o aviso do anterior
  diaSelecionado = diaInfo;
  diaSelecionadoTexto.textContent = `${diaInfo.dia} (${formatarBR(diaInfo.data)})`;
  desenharHorarios(diaInfo);
  irParaEtapa(2);
}

// ---------- ETAPA 2: seleção de horário ----------

function desenharHorarios(diaInfo) {
  gradeHorarios.innerHTML = "";

  diaInfo.horarios.forEach((horario) => {
    const cartao = document.createElement("button");
    cartao.type = "button";
    cartao.className = "cartao cartao-horario";
    cartao.disabled = !horario.disponivel;
    cartao.textContent = horario.hora;
    cartao.addEventListener("click", () => selecionarHorario(horario));
    gradeHorarios.appendChild(cartao);
  });
}

function selecionarHorario(horario) {
  horarioSelecionado = horario;
  resumoHorario.textContent =
    `Horário escolhido: ${diaSelecionado.dia} (${formatarBR(diaSelecionado.data)}), às ${horario.hora}`;
  irParaEtapa(3);
}

// ---------- Controle das 3 etapas ----------

const IDS_TITULOS = { 1: "titulo-dias", 2: "titulo-horarios", 3: "titulo-agendamento" };

// "elementoParaRolar" é opcional: por padrão a tela rola até o título da etapa.
function irParaEtapa(numero, elementoParaRolar) {
  secaoDias.hidden = numero !== 1;
  secaoHorarios.hidden = numero !== 2;
  secaoAgendamento.hidden = numero !== 3;

  Object.entries(passos).forEach(([n, elemento]) => {
    elemento.classList.toggle("etapa-atual", Number(n) === numero);
    elemento.classList.toggle("etapa-concluida", Number(n) < numero);
    if (Number(n) === numero) {
      elemento.setAttribute("aria-current", "step");
    } else {
      elemento.removeAttribute("aria-current");
    }
  });

  // Leva o foco ao título da etapa: quem usa teclado ou leitor de tela
  // continua de onde a tela mudou, em vez de ficar perdido no corpo da página.
  const titulo = document.getElementById(IDS_TITULOS[numero]);
  titulo.focus({ preventScroll: true });
  (elementoParaRolar || titulo).scrollIntoView({ behavior: "smooth" });
}

botaoVoltarDias.addEventListener("click", () => {
  diaSelecionado = null;
  irParaEtapa(1);
});

botaoVoltarHorarios.addEventListener("click", () => {
  horarioSelecionado = null;
  mensagemStatus.textContent = "";
  mensagemStatus.className = "";
  irParaEtapa(2);
});

// Formata o celular enquanto o usuário digita: (11) 91234-5678
campoCelular.addEventListener("input", () => {
  const digitos = campoCelular.value.replace(/\D/g, "").slice(0, 11);
  let formatado = digitos;

  if (digitos.length > 2) {
    formatado = `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  }
  if (digitos.length > 7) {
    formatado = `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }

  campoCelular.value = formatado;
});

// ---------- ETAPA 3: envio do agendamento ----------

formAgendamento.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  // Clique duplo: o segundo clique é ignorado, em vez de chegar ao servidor
  // e mostrar "horário ocupado" para uma consulta que foi marcada.
  if (enviando) return;
  enviando = true;
  const textoOriginal = botaoConfirmar.textContent;
  botaoConfirmar.disabled = true;
  botaoConfirmar.textContent = "Enviando...";

  const dataEscolhida = diaSelecionado.data;

  try {
    const resposta = await fetch("/api/agendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: diaSelecionado.data,
        hora: horarioSelecionado.hora,
        paciente: campoNome.value,
        celular: campoCelular.value,
      }),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      mostrarMensagem(resultado.erro, "erro");

      // Horário ocupado: recarrega a semana e volta à lista de horários do dia,
      // agora com esse horário desabilitado.
      if (resposta.status === 409 && (await carregarSemana(dataEscolhida))) {
        const diaAtualizado = semanaAtual.dias.find((d) => d.data === dataEscolhida);
        if (diaAtualizado) {
          diaSelecionado = diaAtualizado;
          horarioSelecionado = null;
          desenharHorarios(diaAtualizado);
          irParaEtapa(2);
        }
      }
      return;
    }

    const consulta = resultado.agendamento;
    guardarConsulta(consulta.id, consulta.codigo);

    mensagemStatus.textContent = "";
    mensagemStatus.className = "";
    mensagemSucesso.textContent =
      `Consulta marcada para ${consulta.dia}, ${formatarBR(consulta.data)}, às ${consulta.hora}. ` +
      `Para ver ou cancelar, use "Meus Agendamentos" neste navegador.`;
    mensagemSucesso.hidden = false;

    formAgendamento.reset();
    horarioSelecionado = null;
    diaSelecionado = null;
    await carregarSemana(campoData.value); // recarrega para refletir o horário agora ocupado
    irParaEtapa(1, mensagemSucesso); // volta ao início, mostrando o resumo da consulta marcada
  } catch (erro) {
    mostrarMensagem("Não foi possível enviar o agendamento. Verifique a conexão e tente de novo.", "erro");
  } finally {
    enviando = false;
    botaoConfirmar.disabled = false;
    botaoConfirmar.textContent = textoOriginal;
  }
});

// ---------- VISTA: Meus Agendamentos ----------

async function carregarAgendamentos() {
  const guardadas = lerConsultasGuardadas();
  if (guardadas.length === 0) {
    desenharAgendamentos([]);
    return;
  }

  try {
    const resposta = await fetch("/api/meus-agendamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultas: guardadas }),
    });
    const encontradas = await resposta.json();
    if (!resposta.ok) {
      mostrarMensagem(encontradas.erro || "Não foi possível carregar as consultas.", "erro");
      return;
    }

    // Esquece o código das consultas que não existem mais (já canceladas).
    const idsEncontrados = new Set(encontradas.map((c) => c.id));
    guardarConsultas(guardadas.filter((c) => idsEncontrados.has(c.id)));

    desenharAgendamentos(encontradas);
  } catch (erro) {
    mostrarMensagem("Não foi possível carregar as consultas. Verifique a conexão.", "erro");
  }
}

function desenharAgendamentos(agendamentos) {
  listaAgendamentos.innerHTML = "";

  if (agendamentos.length === 0) {
    listaAgendamentos.innerHTML =
      `<p class="dica">Nenhuma consulta marcada neste navegador ainda.</p>`;
    return;
  }

  agendamentos.forEach((agendamento) => {
    const item = document.createElement("div");
    item.className = "cartao-agendamento";
    item.innerHTML = `
      <div class="agendamento-info">
        <strong>${escaparHTML(agendamento.paciente)}</strong>
        <span><span aria-hidden="true">📅</span> <time datetime="${escaparHTML(agendamento.data)}">${formatarBR(agendamento.data)}</time> — ${escaparHTML(agendamento.dia)}</span>
        <span><span aria-hidden="true">🕐</span> ${escaparHTML(agendamento.hora)}</span>
        <span>Status: ${escaparHTML(agendamento.status)}</span>
      </div>
      <div class="agendamento-acoes">
        <button type="button" class="botao-cancelar" data-id="${escaparHTML(agendamento.id)}"
                aria-label="Cancelar agendamento de ${escaparHTML(agendamento.paciente)} em ${formatarBR(agendamento.data)} às ${escaparHTML(agendamento.hora)}">
          <span aria-hidden="true">🗑️</span> Cancelar agendamento
        </button>
        <div class="confirmacao-cancelamento" hidden>
          <p>Tem certeza que deseja cancelar este agendamento?</p>
          <div class="confirmacao-botoes">
            <button type="button" class="botao-manter">Manter consulta</button>
            <button type="button" class="botao-confirmar-cancelamento" data-id="${escaparHTML(agendamento.id)}">
              Sim, cancelar consulta
            </button>
          </div>
        </div>
      </div>
    `;
    listaAgendamentos.appendChild(item);
  });

  // Clicar em "🗑️ Cancelar agendamento" revela a confirmação inline.
  listaAgendamentos.querySelectorAll(".botao-cancelar").forEach((botao) => {
    botao.addEventListener("click", () => {
      botao.hidden = true;
      botao.nextElementSibling.hidden = false;
    });
  });

  // "Manter consulta" (desistir da ação) esconde a confirmação de volta.
  listaAgendamentos.querySelectorAll(".botao-manter").forEach((botao) => {
    botao.addEventListener("click", () => {
      const bloco = botao.closest(".confirmacao-cancelamento");
      bloco.hidden = true;
      bloco.previousElementSibling.hidden = false;
    });
  });

  // "Sim, cancelar consulta" -> chama o back-end de verdade, com id + código.
  listaAgendamentos.querySelectorAll(".botao-confirmar-cancelamento").forEach((botao) => {
    botao.addEventListener("click", async () => {
      const guardada = lerConsultasGuardadas().find((c) => c.id === botao.dataset.id);
      if (!guardada) {
        mostrarMensagem("Não foi possível cancelar: este navegador não tem o código dessa consulta.", "erro");
        return;
      }

      botao.disabled = true; // evita cliques repetidos
      try {
        const resposta = await fetch("/api/cancelar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: guardada.id, codigo: guardada.codigo }),
        });
        const resultado = await resposta.json();

        if (!resposta.ok) {
          botao.disabled = false;
          mostrarMensagem(resultado.erro, "erro");
          return;
        }

        guardarConsultas(lerConsultasGuardadas().filter((c) => c.id !== guardada.id));
        await carregarAgendamentos(); // atualiza a lista
        mostrarMensagem("Agendamento cancelado.", "sucesso"); // confirma que deu certo
      } catch (erro) {
        botao.disabled = false;
        mostrarMensagem("Não foi possível cancelar. Verifique a conexão e tente de novo.", "erro");
      }
    });
  });
}

// ---------- Inicialização ----------

if (document.body.dataset.vista === "meus-agendamentos") {
  carregarAgendamentos();
} else {
  campoData.min = hojeISO(); // o calendário não oferece dias passados
  carregarSemana(hojeISO());
}
