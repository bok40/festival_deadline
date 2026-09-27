const enterButton = document.getElementById("enterButton");
const introVideo = document.getElementById("introVideo");
const audio = document.getElementById("festivalAudio");

let entered = false;

async function enterFestival(event) {
  if (entered) return;
  entered = true;

  try {
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    console.info("Beat ainda não disponível ou bloqueado:", error.message);
  }

  document.body.classList.add("is-entering");

  // Depois da animação da pré-home, entra de fato na homepage.
  window.setTimeout(() => {
    window.location.assign(enterButton.href);
  }, 760);
}

if (enterButton) {
  enterButton.addEventListener("click", enterFestival);
}

introVideo?.play().catch(() => {});
