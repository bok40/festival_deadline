const enterButton = document.getElementById("enterButton");
const entranceScreen = document.getElementById("entranceScreen");
const introVideo = document.getElementById("introVideo");
const audio = document.getElementById("festivalAudio");

let entered = false;

async function enterFestival() {
  if (entered) return;
  entered = true;

  // O vídeo de entrada continua sendo visual; o clique libera o áudio real.
  try {
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    console.info("Beat ainda não disponível ou bloqueado:", error.message);
  }

  document.body.classList.add("is-entering");

  window.setTimeout(() => {
    document.body.classList.add("is-entered");
    // A homepage real será colocada aqui na próxima etapa.
  }, 760);
}

// Qualquer clique na tela atravessa o DEADLINE.
document.addEventListener("click", enterFestival, { once: true });

// Garante que o vídeo fique tocando enquanto a entrada estiver aberta.
introVideo.play().catch(() => {
  // Alguns navegadores podem exigir uma interação antes de reproduzir vídeo.
});
