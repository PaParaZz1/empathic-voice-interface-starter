import { AudioInput, AudioOutput, AssistantInput, SessionSettings, PauseAssistantMessage } from './types';
import { CloseEvent, ErrorEvent } from './events';
import { ReconnectingWebSocket } from './WebSocket';


export type PublishEvent = SessionSettings
export type SubscribeEvent = AudioOutput


export class CustomError extends Error {
  readonly statusCode?: number;
  readonly body?: unknown;

  constructor({
    message,
    statusCode,
    body,
  }: {
    message?: string;
    statusCode?: number;
    body?: unknown;
  }) {
    super(buildMessage({ message, statusCode, body }));
    Object.setPrototypeOf(this, CustomError.prototype);
    if (statusCode != null) {
      this.statusCode = statusCode;
    }

    if (body !== undefined) {
      this.body = body;
    }
  }
}

function buildMessage({
  message,
  statusCode,
  body,
}: {
  message: string | undefined;
  statusCode: number | undefined;
  body: unknown | undefined;
}): string {
  const lines: string[] = [];
  if (message != null) {
    lines.push(message);
  }

  if (statusCode != null) {
    lines.push(`Status code: ${statusCode.toString()}`);
  }

  if (body != null) {
    lines.push(`Body: ${JSON.stringify(body, undefined, 2)}`);
  }

  return lines.join('\n');
}



export declare namespace ChatSocket {
  interface Args {
    sendSocket: ReconnectingWebSocket;
    recvSocket: ReconnectingWebSocket;
  }

  type Response = SubscribeEvent & { receivedAt: Date };

  type EventHandlers = {
    open?: () => void;
    message?: (message: Response) => void;
    close?: (event: CloseEvent) => void;
    error?: (error: Error) => void;
  };
}

export class ChatSocket {
  public readonly sendSocket: ReconnectingWebSocket;
  public readonly recvSocket: ReconnectingWebSocket;
  public readonly sendReadyState: number;
  public readonly recvReadyState: number;

  protected readonly sendEventHandlers: ChatSocket.EventHandlers = {};
  protected readonly recvEventHandlers: ChatSocket.EventHandlers = {};

  constructor({ sendSocket, recvSocket }: ChatSocket.Args) {
    this.sendSocket = sendSocket;
    this.recvSocket = recvSocket;
    this.sendReadyState = sendSocket.readyState;
    this.recvReadyState = recvSocket.readyState;

    this.sendSocket.addEventListener('open', this.handleSendOpen);
    this.sendSocket.addEventListener('message', this.handleSendMessage);
    this.sendSocket.addEventListener('close', this.handleSendClose);
    this.sendSocket.addEventListener('error', this.handleSendError);
    this.recvSocket.addEventListener('open', this.handleRecvOpen);
    this.recvSocket.addEventListener('message', this.handleRecvMessage);
    this.recvSocket.addEventListener('close', this.handleRecvClose);
    this.recvSocket.addEventListener('error', this.handleRecvError);
  }

  /**
   * @param event - The event to attach to.
   * @param callback - The callback to run when the event is triggered.
   *
   * @example
   * ```ts
   * const socket = hume.empathicVoice.chat.connect({ apiKey: "...." });
   * socket.on('open', () => {
   *  console.log('Socket opened');
   * });
   * ```
   */
  on<T extends keyof ChatSocket.EventHandlers>(
    event: T,
    callback: ChatSocket.EventHandlers[T],
  ) {
    this.sendEventHandlers[event] = callback;
  }

  /**
   * Send audio input
   */
  public sendAudioInput(
    message: Omit<AudioInput, 'type'>,
  ): void {
    this.assertSocketIsOpen();
    this.sendJson({
      type: 'audio_input',
      ...message,
    });
  }

  /**
   * Send session settings
   */
  public sendSessionSettings(
    message: Omit<SessionSettings, 'type'>,
  ): void {
    this.assertSocketIsOpen();
    this.sendJson({
      type: 'session_settings',
      ...message,
    });
  }

  /**
   * Send assistant input
   */
  public sendAssistantInput(
    message: Omit<AssistantInput, 'type'>,
  ): void {
    this.assertSocketIsOpen();
    this.sendJson({
      type: 'assistant_input',
      ...message,
    });
  }

  /**
   * Send pause assistant message
   */
  public pauseAssistant(
    message: Omit<PauseAssistantMessage, 'type'>,
  ): void {
    this.assertSocketIsOpen();
    this.sendJson({
      type: 'pause_assistant_message',
      ...message,
    });
  }

  /**
   * Send resume assistant message
   */
  public resumeAssistant(
    message: Omit<ResumeAssistantMessage, 'type'>,
  ): void {
    this.assertSocketIsOpen();
    this.sendJson({
      type: 'resume_assistant_message',
      ...message,
    });
  }

  /**
   * Send text input
   */
  public sendUserInput(text: string): void {
    this.assertSocketIsOpen();
    this.sendJson({
      type: 'user_input',
      text,
    });
  }

  /**
   * @name connect
   * @description
   * Connect to the ReconnectingWebSocket.
   */
  public connect(): ChatSocket {
    this.sendSocket.reconnect();
    this.recvSocket.reconnect();

    this.sendSocket.addEventListener('open', this.handleSendOpen);
    this.sendSocket.addEventListener('message', this.handleSendMessage);
    this.sendSocket.addEventListener('close', this.handleSendClose);
    this.sendSocket.addEventListener('error', this.handleSendError);
    this.recvSocket.addEventListener('open', this.handleRecvOpen);
    this.recvSocket.addEventListener('message', this.handleRecvMessage);
    this.recvSocket.addEventListener('close', this.handleRecvClose);
    this.recvSocket.addEventListener('error', this.handleRecvError);
    return this;
  }

  /**
   * Closes the underlying socket.
   */
  public close(): void {
    this.sendSocket.close();
    this.recvSocket.close();

    this.handleSendClose({ code: 1000 } as CloseEvent);

    this.sendSocket.removeEventListener('open', this.handleSendOpen);
    this.sendSocket.removeEventListener('message', this.handleSendMessage);
    this.sendSocket.removeEventListener('close', this.handleSendClose);
    this.sendSocket.removeEventListener('error', this.handleSendError);
    this.recvSocket.removeEventListener('open', this.handleRecvOpen);
    this.recvSocket.removeEventListener('message', this.handleRecvMessage);
    this.recvSocket.removeEventListener('close', this.handleRecvClose);
    this.recvSocket.removeEventListener('error', this.handleRecvError);
  }

  public async tillSocketOpen(): Promise<ReconnectingWebSocket> {
    if (this.socket.readyState === ReconnectingWebSocket.OPEN) {
      return this.socket;
    }
    return new Promise((resolve, reject) => {
      this.socket.addEventListener('open', () => {
        resolve(this.socket);
      });

      this.socket.addEventListener('error', (event: unknown) => {
        reject(event);
      });
    });
  }

  private assertSocketIsOpen(): void {
    if (!this.sendSocket) {
      throw new CustomError({ message: 'Socket is not connected.' });
    }

    if (this.sendSocket.readyState !== ReconnectingWebSocket.OPEN) {
      throw new CustomError({ message: 'Socket is not open.' });
    }
  }

  private sendJson(payload: PublishEvent): void {
    const jsonPayload = serializers.empathicVoice.PublishEvent.jsonOrThrow(
      payload,
      {
        unrecognizedObjectKeys: 'strip',
      },
    );
    console.log('json', jsonPayload);
    this.sendSocket.send(JSON.stringify(jsonPayload));
  }

  private handleSendOpen = () => {
    this.sendEventHandlers.open?.();
  };

  private handleRecvOpen = () => {
    this.recvEventHandlers.open?.();
  };

  private handleSendMessage = (event: { data: string }): void => {
    const data = JSON.parse(event.data);

    const parsedResponse = serializers.empathicVoice.SubscribeEvent.parse(
      data,
      {
        unrecognizedObjectKeys: 'passthrough',
        allowUnrecognizedUnionMembers: true,
        allowUnrecognizedEnumValues: true,
        breadcrumbsPrefix: ['response'],
      },
    );
    if (parsedResponse.ok) {
      this.eventHandlers.message?.({
        ...parsedResponse.value,
        receivedAt: new Date(),
      });
    } else {
      this.eventHandlers.error?.(new Error(`Received unknown message type`));
    }
  };

  private handleRecvMessage = (event: { data: string }): void => {
    console.log('recv event.data', event.data);
    const data = JSON.parse(event.data);

    const parsedResponse = serializers.empathicVoice.SubscribeEvent.parse(
      data,
      {
        unrecognizedObjectKeys: 'passthrough',
        allowUnrecognizedUnionMembers: true,
        allowUnrecognizedEnumValues: true,
        breadcrumbsPrefix: ['response'],
      },
    );
    if (parsedResponse.ok) {
      this.eventHandlers.message?.({
        ...parsedResponse.value,
        receivedAt: new Date(),
      });
    } else {
      this.eventHandlers.error?.(new Error(`Received unknown message type`));
    }
  };

  private handleSendClose = (event: CloseEvent) => {
    this.sendEventHandlers.close?.(event);
  };

  private handleRecvClose = (event: CloseEvent) => {
    this.recvEventHandlers.close?.(event);
  };

  private handleSendError = (event: ErrorEvent) => {
    const message = event.message ?? 'ReconnectingWebSocket error';
    this.sendEventHandlers.error?.(new Error(message));
  };

  private handleRecvError = (event: ErrorEvent) => {
    const message = event.message ?? 'ReconnectingWebSocket error';
    this.recvEventHandlers.error?.(new Error(message));
  };
}
