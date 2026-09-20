export const ROOM_MISSING =
  'Your previous game is no longer available. Unfinished games aren’t counted. You can start a new game.';

export function rememberRoom(id: string | null) {
  try {
    if (id) sessionStorage.setItem('tg_room', id);
    else sessionStorage.removeItem('tg_room');
  } catch {}
}

export function rememberedRoom(): string | null {
  try {
    return sessionStorage.getItem('tg_room');
  } catch {
    return null;
  }
}
