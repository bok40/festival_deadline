DEADLINE // AUDIO

Coloque aqui o beat oficial do site com este nome exato:

deadline-beat.wav

O audio.js procura automaticamente este arquivo.

O sistema faz:
- loop infinito;
- play/pause pelo painel DEADLINE BEAT;
- salva a posição ao trocar de página;
- tenta continuar de onde parou;
- analisa graves, médios e agudos pela Web Audio API;
- anima as bordas e barras do painel conforme o áudio;
- pausa o beat quando outro <audio> ou <video> do site começa a tocar;
- integra com o Spotify Embed para pausar o beat quando o Spotify começa e retomar quando para.

IMPORTANTE:
A análise de frequência real funciona para elementos de áudio/vídeo que o navegador pode expor ao Web Audio API. O Spotify é um iframe de outra origem, então o navegador não entrega os samples de áudio dele ao site. Nesse caso, o DEADLINE usa uma animação de atividade enquanto o Spotify está tocando, sem tentar capturar ou modificar o áudio do Spotify.
