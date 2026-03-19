import { moderateText } from "@/lib/security/moderation";

type BaseParams = {
  input: string;
  userId?: string | null;
  ip?: string;
  path?: string;
  requestId?: string;
};

export async function preInputModeration(params: BaseParams) {
  return moderateText(params.input, {
    userId: params.userId,
    ip: params.ip,
    path: params.path,
    requestId: params.requestId,
    stage: "pre_input",
  });
}

export async function postModelModeration(params: BaseParams) {
  return moderateText(params.input, {
    userId: params.userId,
    ip: params.ip,
    path: params.path,
    requestId: params.requestId,
    stage: "post_model",
  });
}

export async function finalOutputModeration(params: BaseParams) {
  return moderateText(params.input, {
    userId: params.userId,
    ip: params.ip,
    path: params.path,
    requestId: params.requestId,
    stage: "final_output",
  });
}
