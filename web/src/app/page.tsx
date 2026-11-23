import { getPublicRepoMeta, isPassphraseRequired } from "@/lib/auth";
import { StudioClient } from "./components/StudioClient";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const requiresPassphrase = isPassphraseRequired();
  const { owner, repo } = getPublicRepoMeta();

  return (
    <StudioClient
      requiresPassphrase={requiresPassphrase}
      repoOwner={owner}
      repoName={repo}
    />
  );
}
