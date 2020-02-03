import { Context, Request } from '@voiceflow/client';
import { ResponseBuilder as _ResponseBuilder } from 'ask-sdk';
import { Intent } from 'ask-sdk-model';

export type Mapping = { variable: string; slot: string };

export type Block = { [key: string]: any };

export type ResponseBuilder = (context: Context, builder: _ResponseBuilder) => void | boolean;

export enum RequestType {
  INTENT = 'INTENT',
}

export interface IntentRequestPayload {
  intent: Intent;
}

export interface IntentRequest extends Request {
  type: RequestType.INTENT;
  payload: IntentRequestPayload;
}