export interface AudioOutput {
  /** The type of message sent through the socket; for an Audio Output message, this must be `audio_output`. */
  type: 'audio_output';
  /** Used to manage conversational state, correlate frontend and backend data, and persist conversations across EVI sessions. */
  customSessionId?: string;
  /** ID of the audio output. Allows the Audio Output message to be tracked and referenced. */
  id: string;
  /** Base64 encoded audio output. This encoded audio is transmitted to the client, where it can be decoded and played back as part of the user interaction. */
  data: string;
}
