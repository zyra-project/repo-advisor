// SPDX-License-Identifier: Apache-2.0

import zyra from "../profiles/zyra.json";
import terraviz from "../profiles/terraviz.json";
import type { ProjectProfile } from "./types";

// Project-owned, reviewed configuration. Request data cannot supply repositories or URLs.
export const profiles: readonly ProjectProfile[] = [zyra, terraviz] as ProjectProfile[];

export function getProfile(id: string): ProjectProfile | undefined {
  return profiles.find((profile) => profile.id === id);
}
