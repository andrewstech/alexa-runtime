import { AlexaVersion, RepeatType, SessionType } from '@voiceflow/alexa-types';
import { Context, Frame, Store } from '@voiceflow/client';
import { HandlerInput } from 'ask-sdk';

import { F, S, T, V } from '@/lib/constants';
import { createResumeFrame, RESUME_DIAGRAM_ID } from '@/lib/services/voiceflow/diagrams/resume';
import { StreamAction } from '@/lib/services/voiceflow/handlers/stream';

export const VAR_VF = 'voiceflow';

const utilsObj = {
  resume: {
    createResumeFrame,
    RESUME_DIAGRAM_ID,
  },
  client: {
    Frame,
    Store,
  },
};

export const initializeGenerator = (utils: typeof utilsObj) => async (context: Context, input: HandlerInput): Promise<void> => {
  const { requestEnvelope } = input;

  // fetch the metadata for this version (project)
  const {
    platformData: { settings, slots },
    variables: versionVariables,
    rootDiagramID,
  } = await context.fetchVersion<AlexaVersion>();

  const { stack, storage, variables } = context;

  storage.delete(S.STREAM_TEMP);

  // increment user sessions by 1 or initialize
  if (!storage.get(S.SESSIONS)) {
    storage.set(S.SESSIONS, 1);
  } else {
    storage.produce((draft) => {
      draft[S.SESSIONS] += 1;
    });
  }

  // set based on input
  storage.set(S.LOCALE, requestEnvelope.request.locale);
  storage.set(S.USER, requestEnvelope.context.System.user.userId);
  storage.set(S.SUPPORTED_INTERFACES, requestEnvelope.context.System.device?.supportedInterfaces);

  // set based on metadata
  storage.set(S.ALEXA_PERMISSIONS, settings.permissions ?? []);
  storage.set(S.REPEAT, settings.repeat ?? RepeatType.ALL);

  // default global variables
  variables.merge({
    [V.TIMESTAMP]: 0,
    locale: storage.get(S.LOCALE),
    user_id: storage.get(S.USER),
    sessions: storage.get(S.SESSIONS),
    platform: 'alexa',

    // hidden system variables (code block only)
    [VAR_VF]: {
      // TODO: implement all exposed voiceflow variables
      permissions: storage.get(S.ALEXA_PERMISSIONS),
      capabilities: storage.get(S.SUPPORTED_INTERFACES),
      events: [],
    },
    _system: input.requestEnvelope.context.System,
  });

  // initialize all the global variables, as well as slots as global variables
  utils.client.Store.initialize(variables, versionVariables, 0);
  utils.client.Store.initialize(
    variables,
    slots.map((slot) => slot.name),
    0
  );

  // end any existing stream
  if (storage.get(S.STREAM_PLAY)) {
    storage.produce((draft) => {
      draft[S.STREAM_PLAY].action = StreamAction.END;
    });
  }

  const { session = { type: SessionType.RESTART } } = settings;
  // restart logic
  const shouldRestart = stack.isEmpty() || session.type === SessionType.RESTART || variables.get(VAR_VF)?.resume === false;
  if (shouldRestart) {
    // start the stack with just the root flow
    stack.flush();
    stack.push(new utils.client.Frame({ diagramID: rootDiagramID }));

    // we've created a brand new stack
    context.turn.set(T.NEW_STACK, true);
  } else if (session.type === SessionType.RESUME && session.resume) {
    // resume prompt flow - use command flow logic
    stack.top().storage.set(F.CALLED_COMMAND, true);

    // if there is an existing resume flow, remove itself and anything above it
    const resumeStackIndex = stack.getFrames().findIndex((frame) => frame.getDiagramID() === utils.resume.RESUME_DIAGRAM_ID);
    if (resumeStackIndex >= 0) {
      stack.popTo(resumeStackIndex);
    }

    stack.push(utils.resume.createResumeFrame(session.resume, session.follow));
  } else {
    // give context to where the user left off with last speak block
    stack.top().storage.delete(F.CALLED_COMMAND);
    const lastSpeak = stack.top().storage.get(F.SPEAK) ?? '';

    storage.set(S.OUTPUT, lastSpeak);
    context.trace.speak(lastSpeak);
  }
};

export default initializeGenerator(utilsObj);
