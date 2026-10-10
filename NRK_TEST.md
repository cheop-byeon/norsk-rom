# Real media to Norwegian practice: test report

## Result

The real-media path is **partly working**. The app accepted a public NRK podcast excerpt and the local NB-Whisper Tiny endpoint transcribed it in 2.7 seconds. The next step, creating reliable questions and speaking prompts, did not pass: the local `llama3.2` model produced unsupported quiz details and inaccurate expression meanings. The backend rejected the draft and saved no lesson. The hosted NB-Whisper Large demo returned HTTP 503, so this run used the local recognizer.

The lesson session also does not replay the original clip after generation. It synthesizes the confirmed transcript for playback while the original media remains in Studio. That means the current session is not yet a true “listen to the source, then practise speaking about it” experience.

## Source and run

- Source: NRK’s official *Kjapt oppdatert* podcast feed: <https://podkast.nrk.no/program/kjapt_oppdatert.rss>
- Episode: “Keepertabbe kostet Norge dyrt,” published 28 September 2026.
- Excerpt: 18–58 seconds, converted locally to mono 16 kHz WAV and sent to the app’s local transcription endpoint.
- Speech recognition: local NB-Whisper Tiny, 2.7 seconds.
- Hosted recognizer check: NB-Whisper Large demo returned HTTP 503.
- Lesson generation: B1 request to the local `llama3.2` model. The draft included details that were not in the excerpt, failed to copy evidence exactly, or gave inaccurate phrase meanings. The endpoint returned HTTP 503 and did not save the draft.

The local transcript broadly captured a discussion of Norway–Portugal in the Nations League, including Portugal taking an early lead and Norway having the upper hand. It also had errors in names and phrasing. Treat it as a draft for a learner to confirm, not a clean transcript.

## Recommended lesson flow

Existing tools suggest a useful pattern. Twee lets a teacher trim a media clip, choose a question format and CEFR target, then edit the generated questions. LingQ imports a video with synchronized transcript, audio and vocabulary. For this app’s listening-and-speaking focus, I recommend:

1. Choose a permitted audio or video file and select a short clip.
2. Listen once without showing the transcript. Ask one gist question, then one or two detail questions.
3. Reveal the transcript only after the attempt. Let the learner correct transcription errors, then show two or three useful expressions with plain-language meanings.
4. Replay the **same original clip** and let the learner replay the tricky part. Use synthesized speech only for phrase pronunciation practice.
5. Start a role-play about the clip’s topic. Give the learner the phrases as optional prompts, then respond naturally and point out one useful grammar correction.
6. End with a short spoken recap and one retry of a missed question.

For the football excerpt, an appropriate speaking scene would be “discuss the match with a friend.” Useful transcript-backed phrases include “nokså tidlig i kampen” (“fairly early in the match”) and “hadde overtaket” (“had the upper hand”). The actual quiz should be generated only after transcript review, since ASR errors can change the meaning.

## Current limits exposed by this test

- Local NB-Whisper Tiny is fast but can garble names and wording.
- Hosted NB-Whisper Large was unavailable in this run.
- Local lesson generation failed its evidence checks on real ASR output. It needs stronger source-grounding and a review/edit step before a lesson is saved.
- Original audio is not carried into the generated lesson session; session playback synthesizes the transcript.
- The selected CEFR level sets the question target; it does not certify the source audio’s level.
- Speech recognition does not assess pronunciation. Conversation grammar feedback and pronunciation scoring should be presented as separate capabilities.

## References

- [Twee Audio & Video Question Creator](https://twee.com/tools/audio-video-questions): clip trimming, question formats, CEFR target and editable questions.
- [LingQ: Import Any YouTube Video](https://www.lingq.com/blog/import-any-youtube-video-into-lingq/): imported video with transcript, audio and vocabulary support.
