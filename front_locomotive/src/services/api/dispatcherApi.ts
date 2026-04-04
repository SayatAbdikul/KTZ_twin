import { replayApiClient } from './replayApiClient'
import { adaptDispatchChatMessage, type DispatchChatMessage } from '@/features/dispatch-console/useDispatchConsoleStore'

export async function fetchDispatcherChat(locomotiveId: string): Promise<DispatchChatMessage[]> {
  const response = await replayApiClient.get<unknown[]>(`/api/locomotives/${locomotiveId}/chat`)
  return (response.data ?? []).map((item) => adaptDispatchChatMessage(item, locomotiveId))
}
