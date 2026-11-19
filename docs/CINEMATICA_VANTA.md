# La primera guardia

Cinemática de Historia ambientada en Vanta en 2061. Presenta al jugador como estudiante de seguridad en su primera guardia. El relato explica cómo el Core enlaza a los residentes con los servicios y qué cambia cuando Vanta pierde su ruta. Al terminar se abre la terminal, donde `cat README.txt` enlaza con el primer encargo.

- `apps/frontend/public/intro/vanta-es.mp4` y `vanta-en.mp4` contienen la imagen y el audio.
- Los archivos `.vtt` contienen los subtítulos correspondientes. `apps/frontend/src/views/story-opening.json` contiene la transcripción.
- El video español integra la versión mejorada de `XPLOITWORLD_Reconocimiento_1080p.mp4`, con la narración de Carlos aportada por el usuario. Usa H.264 y AAC en 1920 × 1080, dura 86,5 segundos y contiene los subtítulos dentro de la imagen. La pista WebVTT puede activarse desde los controles del reproductor.
- La versión inglesa usa el montaje ilustrado y las voces sintetizadas de Piper [joe](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/joe/medium) y [ljspeech](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium).
- La [guía del servidor completo](SERVIDOR_COMPLETO.md#reemplazar-la-introducción) indica cómo sustituir el video en una instalación local o alojada.
