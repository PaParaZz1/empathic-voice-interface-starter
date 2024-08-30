"use client";

import { useCallback, useRef, useState } from 'react';
import { AudioOutput, JsonMessage, AssistantMessage, UserMessage } from './types';
import { ChatSocket } from './ChatSocket';
import { ReconnectingWebSocket } from './WebSocket';

import { type AuthStrategy } from './auth';

const isNever = (_n: never) => {
  return;
};

export type SocketConfig = {
  sendHostname: string;
  recvHostname: string;
}

export enum VoiceReadyState {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  OPEN = 'open',
  CLOSED = 'closed',
}


export const useVoiceClient = (props: {
  onAudioMessage?: (message: AudioOutput) => void;
  onMessage?: (
    message: JsonMessage & { receivedAt: Date },
  ) => void;
  onError?: (message: string, error?: Error) => void;
  onOpen?: () => void;
  onClose?: ChatSocket.sendEventHandlers['close'];
}) => {
  const client = useRef<ChatSocket | null>(null);

  const [readyState, setReadyState] = useState<VoiceReadyState>(
    VoiceReadyState.IDLE,
  );

  // this pattern might look hacky but it allows us to use the latest props
  // in callbacks set up inside useEffect without re-rendering the useEffect
  const onAudioMessage = useRef<typeof props.onAudioMessage>(
    props.onAudioMessage,
  );
  onAudioMessage.current = props.onAudioMessage;

  const onMessage = useRef<typeof props.onMessage>(props.onMessage);
  onMessage.current = props.onMessage;

  const onError = useRef<typeof props.onError>(props.onError);
  onError.current = props.onError;

  const onOpen = useRef<typeof props.onOpen>(props.onOpen);
  onOpen.current = props.onOpen;

  const onClose = useRef<typeof props.onClose>(props.onClose);
  onClose.current = props.onClose;

  const connect = useCallback((config: SocketConfig) => {
    return new Promise((resolve, reject) => {
      console.log('cfg', config)
      const sendSocket = new ReconnectingWebSocket(`${config.sendHostname}`);
      const recvSocket = new ReconnectingWebSocket(`${config.recvHostname}`);
      client.current = new ChatSocket({ sendSocket, recvSocket })

      client.current.on('open', () => {
        onOpen.current?.();
        setReadyState(VoiceReadyState.OPEN);
        resolve(VoiceReadyState.OPEN);
      });

      client.current.on('message', (message) => {
        if (message.type === 'audio_output') {
          const messageWithReceivedAt = { ...message, receivedAt: new Date() };
          if (message.question) {
            const questionMessage: UserMessage = {
              type: 'user_message',
              fromText: false,
              message: {
                role: 'user',
                content: message.question,
              },
              receivedAt: new Date(),
            };
            onMessage.current?.(questionMessage);
          }
          if (message.answer) {
            const textMessage: AssistantMessage = {
              type: 'assistant_message',
              id: message.id,
              fromText: false,
              message: {
                role: 'assistant',
                content: message.answer,
              },
              receivedAt: new Date(),
            };
            onMessage.current?.(textMessage);
          }
          // delay 100ms to make sure the audio message is played after the text message

          setTimeout(() => {
            onAudioMessage.current?.(messageWithReceivedAt);
          }, 200);
          return;
        }

        if (
          message.type === 'assistant_message' ||
          message.type === 'user_message' ||
          message.type === 'user_interruption' ||
          message.type === 'error' ||
          message.type === 'chat_metadata' ||
          message.type === 'assistant_end'
        ) {
          const messageWithReceivedAt = { ...message, receivedAt: new Date() };
          onMessage.current?.(messageWithReceivedAt);
          return;
        }
        // asserts that all message types are handled
        isNever(message);
        return;
      });

      client.current.on('close', (event) => {
        onClose.current?.(event);
        setReadyState(VoiceReadyState.CLOSED);
      });

      client.current.on('error', (e) => {
        const message = e instanceof Error ? e.message : 'Unknown error';
        onError.current?.(message, e instanceof Error ? e : undefined);
        reject(e);
      });

      setReadyState(VoiceReadyState.CONNECTING);
    });
  }, []);

  const disconnect = useCallback(() => {
    setReadyState(VoiceReadyState.IDLE);
    client.current?.close();
  }, []);

  const sendSessionSettings = useCallback(
    (sessionSettings: SessionSettings) => {
      client.current?.sendSessionSettings(sessionSettings);
    },
    [],
  );

  const sendAudio = useCallback((arrayBuffer: ArrayBufferLike) => {
    client.current?.sendSocket?.send(arrayBuffer);
  }, []);

  const sendUserInput = useCallback((text: string) => {
    client.current?.sendUserInput(text);
  }, []);

  const sendAssistantInput = useCallback((text: string) => {
    client.current?.sendAssistantInput({
      text,
    });
  }, []);

  const sendPauseAssistantMessage = useCallback(() => {
    client.current?.pauseAssistant({});
  }, []);
  const sendResumeAssistantMessage = useCallback(() => {
    client.current?.resumeAssistant({});
  }, []);

  return {
    readyState,
    sendSessionSettings,
    sendAudio,
    connect,
    disconnect,
    sendUserInput,
    sendAssistantInput,
    sendPauseAssistantMessage,
    sendResumeAssistantMessage,
  };
};
