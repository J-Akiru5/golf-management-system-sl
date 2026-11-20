/**
 * The public chat's exports.
 *
 * `ChatLauncher` is the only thing a layout needs; `ChatPanel` is deliberately not re-exported so
 * that importing the launcher cannot pull the panel into the first bundle.
 */
export { ChatLauncher } from "./ChatLauncher";
export { TeeoAvatar } from "./TeeoAvatar";
