import { useCallback, useRef, useState } from 'react';
import { AudioOutput, JsonMessage } from './types';
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
      const sendSocket = new ReconnectingWebSocket(`ws://${config.sendHostname}`);
      const recvSocket = new ReconnectingWebSocket(`ws://${config.recvHostname}`);
      client.current = new ChatSocket({ sendSocket, recvSocket })

      client.current.on('open', () => {
        onOpen.current?.();
        setReadyState(VoiceReadyState.OPEN);
        resolve(VoiceReadyState.OPEN);
      });

      client.current.on('message', (message) => {
        if (message.type === 'audio_output') {
          const messageWithReceivedAt = { ...message, receivedAt: new Date() };
          onAudioMessage.current?.(messageWithReceivedAt);
          return;
        }

        if (
          message.type === 'assistant_message' ||
          message.type === 'user_message' ||
          message.type === 'user_interruption' ||
          message.type === 'error' ||
          message.type === 'tool_response' ||
          message.type === 'tool_error' ||
          message.type === 'chat_metadata' ||
          message.type === 'assistant_end'
        ) {
          const messageWithReceivedAt = { ...message, receivedAt: new Date() };
          onMessage.current?.(messageWithReceivedAt);
          return;
        }

        if (message.type === 'tool_call') {
          const messageWithReceivedAt = { ...message, receivedAt: new Date() };
          onMessage.current?.(messageWithReceivedAt);
          void onToolCall
            .current?.(messageWithReceivedAt, {
              success: (content: unknown) => ({
                type: 'tool_response',
                toolCallId: messageWithReceivedAt.toolCallId,
                content: JSON.stringify(content),
              }),
              error: ({
                error,
                code,
                level,
                content,
              }: {
                error: string;
                code: string;
                level: string;
                content: string;
              }) => ({
                type: 'tool_error',
                toolCallId: messageWithReceivedAt.toolCallId,
                error,
                code,
                level: level !== null ? 'warn' : undefined, // level can only be warn
                content,
              }),
            })
            .then((response) => {
              // check that response is a correctly formatted response or error payload
              // TODO
              const parsedResponse = {type: 'tool_response', ok: true};
              const parsedError = {type: 'tool_error', ok: true};

              // if valid send it to the socket
              // otherwise, report error
              if (response.type === 'tool_response' && parsedResponse.ok) {
                client.current?.sendToolResponseMessage(response);
              } else if (response.type === 'tool_error' && parsedError.ok) {
                client.current?.sendToolErrorMessage(response);
              } else {
                onError.current?.('Invalid response from tool call');
              }
            });
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
