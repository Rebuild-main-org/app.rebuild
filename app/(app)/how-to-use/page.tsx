import {
  BookOpen,
  Briefcase,
  Boxes,
  Bot,
  TerminalSquare,
  GitPullRequest,
  ShieldCheck,
  LayoutDashboard,
  LifeBuoy,
} from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const dynamic = "force-dynamic"

function Cmd({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted block overflow-x-auto rounded-md px-3 py-2 font-mono text-xs whitespace-pre">
      {children}
    </code>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 pb-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-muted-foreground space-y-2 text-sm">{children}</div>
      </div>
    </div>
  )
}

export default function HowToUsePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <BookOpen className="size-6" /> How to use?
        </h1>
        <p className="text-muted-foreground text-sm">
          REBUILD Engineering OS, de bout en bout : du prospect au livrable mergé sur GitHub.
          Suis l&apos;ordre ci-dessous — chaque étape débloque la suivante.
        </p>
      </div>

      {/* Big picture */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Le flux en une image</CardTitle>
          <CardDescription>Une chaîne unique, du CRM jusqu&apos;à GitHub.</CardDescription>
        </CardHeader>
        <CardContent>
          <Cmd>{`CRM (lead) ─convert→ Workspace + Projet + branche + repo (CI auto)
   → Agent IA choisi (bibliothèque)
   → rebuild216 : livraison par ticket (commits locaux, jamais de push)
   → /push  → rebuild216 -ops : intègre les branches prêtes → PR + revue IA
   → CI verte + revue → merge sur main = livrable`}</Cmd>
        </CardContent>
      </Card>

      {/* 1. CRM */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="size-4" /> 1. CRM — du prospect au workspace
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Step n={1} title="Créer un lead">
            <p>
              <strong>CRM</strong> → <em>New lead</em> (société, contact, email, valeur). Glisse-le
              dans le pipeline : LEAD → QUALIFIED → PROPOSAL → WON.
            </p>
          </Step>
          <Step n={2} title="(Optionnel) Devis IA">
            <p>Sur un lead QUALIFIED/PROPOSAL, bouton <em>AI quote</em> → brouillon de devis.</p>
          </Step>
          <Step n={3} title="Convertir en delivery">
            <p>
              Sur un lead <strong>WON</strong> → <em>Convert to workspace</em>. Choisis le nom du
              projet, son <strong>short code</strong> (préfixe des tickets, ex. <code>ACME</code>) et
              le <strong>delivery lead</strong>. Cela crée (ou réutilise) le workspace du client, son
              repo GitHub (privé, avec CI par défaut), et le 1ᵉʳ projet.
            </p>
          </Step>
        </CardContent>
      </Card>

      {/* 2. Workspace */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="size-4" /> 2. Workspace — projets &amp; branches
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Step n={1} title="Un repo par workspace, une branche par projet">
            <p>
              Tous les projets d&apos;un client partagent <strong>un seul repo</strong>. Chaque projet
              vit sur <strong>sa branche</strong> (le nom du projet « slugifié »). rebuild216 s&apos;y
              place automatiquement.
            </p>
          </Step>
          <Step n={2} title="Ajouter des projets">
            <p>
              <strong>Workspace → Projects → New project</strong>. Le short code doit être unique dans
              le workspace.
            </p>
          </Step>
          <Step n={3} title="Construire le backlog">
            <p>
              <strong>Overview → Import architecture</strong> : colle un doc d&apos;architecture, l&apos;IA
              génère projets + tickets (avec une <em>Definition of Done</em>). Ou crée les tickets à la
              main, ou laisse rebuild216 proposer un backlog.
            </p>
          </Step>
        </CardContent>
      </Card>

      {/* 3. Agent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4" /> 3. Choisir l&apos;agent IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Step n={1} title="La bibliothèque d'agents">
            <p>
              <strong>Admin → AI Agents</strong> : chaque agent est un bundle de fichiers
              (soul.md, skills.md, design, knowledge…). Des dizaines d&apos;agents engineering &amp;
              design sont déjà installés.
            </p>
          </Step>
          <Step n={2} title="Affecter au workspace">
            <p>
              Sur <strong>Workspace → Overview</strong> (carte « AI Agent ») ou{" "}
              <strong>Settings → AI Agent</strong>, choisis un ou plusieurs agents. Ils sont injectés
              quand rebuild216 se connecte (ex. un agent code + un agent design).
            </p>
          </Step>
        </CardContent>
      </Card>

      {/* 4. rebuild216 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TerminalSquare className="size-4" /> 4. Livrer avec rebuild216 (CLI)
          </CardTitle>
          <CardDescription>L&apos;agent autonome qui code les tickets. Voir aussi la page <strong>rebuild216 CLI</strong>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Step n={1} title="Installer (une fois)">
            <Cmd>{`# macOS / Linux
curl -fsSL https://app.rebuild.tn/cli/install.sh | sh
# Windows (PowerShell)
irm https://app.rebuild.tn/cli/install.ps1 | iex`}</Cmd>
            <p>Prérequis : Node ≥ 18, <code>claude login</code> (compte Anthropic), et un <code>GITHUB_TOKEN</code> pour cloner/pusher les repos privés.</p>
          </Step>
          <Step n={2} title="Se connecter">
            <Cmd>rebuild216 login</Cmd>
            <p>Email + mot de passe REBUILD → un token est stocké. La page <strong>rebuild216 CLI</strong> indique si une session est connectée.</p>
          </Step>
          <Step n={3} title="Lancer sur un projet">
            <Cmd>rebuild216 &quot;Nom du projet&quot;</Cmd>
            <p>
              Clone le repo, se place sur la branche du projet, injecte l&apos;agent dans
              <code> .rebuild/</code>, puis : mode <strong>autonome</strong> (livre les tickets ouverts)
              ou <strong>chat</strong>. Par ticket : passe IN_PROGRESS → implémente → typecheck/tests →
              screenshots → commit local → IN_REVIEW → DONE. <strong>Rien n&apos;est poussé</strong> tant
              que tu ne tapes pas <code>/push</code>.
            </p>
          </Step>
          <Step n={4} title="Commandes en session">
            <p><code>/run</code> (passe autonome), <code>/push</code> (le seul moyen de pousser), <code>/status</code>, <code>/log</code>, <code>/quit</code>.</p>
          </Step>
        </CardContent>
      </Card>

      {/* 5. Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitPullRequest className="size-4" /> 5. Intégrer &amp; livrer — <code>-ops</code>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Step n={1} title="Lancer l'intégration">
            <Cmd>rebuild216 -ops</Cmd>
            <p>
              Choisis un repo. <code>-ops</code> n&apos;intègre que les branches dont le projet est
              <strong> Review/Done</strong> (sinon <code>REBUILD_OPS_ALL=1</code>), les fusionne sur une
              branche d&apos;intégration (conflits résolus par Claude), build + tests, puis…
            </p>
          </Step>
          <Step n={2} title="Une PR, pas un push direct">
            <p>
              … ouvre une <strong>Pull Request vers main</strong> avec une <strong>revue IA</strong>
              postée en commentaire (note A–D + findings). <code>main</code> est protégé : on merge
              <strong> seulement</strong> quand la CI est verte et la revue traitée.
            </p>
          </Step>
          <Step n={3} title="CI / CD">
            <p>
              Chaque repo a une CI par défaut (install → lint → typecheck → tests → build) qui tourne
              sur la PR. Suis tout dans <strong>Workspace → Git &amp; CI/CD</strong>.
            </p>
          </Step>
        </CardContent>
      </Card>

      {/* 6. Track + quality */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutDashboard className="size-4" /> 6. Suivre &amp; piloter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-muted-foreground text-sm">
          <p>• <strong>Dashboard</strong> : tes tâches du jour + commits/PRs (lie ton <em>GitHub username</em> dans <strong>Profile</strong>).</p>
          <p>• <strong>Workspace → Overview</strong> : santé, commits récents (toutes branches), agent, « sizing consistency ».</p>
          <p>• <strong>Analytics / Reports</strong> : vélocité, DORA, avancement.</p>
          <p>• <strong>Admin → Audit log</strong> : toutes les actions tracées.</p>
        </CardContent>
      </Card>

      {/* Quality + access */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Qualité garantie
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1.5 text-sm">
            <p>• DONE impossible sans passer par IN_PROGRESS → IN_REVIEW.</p>
            <p>• Rien sur <code>main</code> sans PR + CI verte + revue IA.</p>
            <p>• Definition of Done sur chaque ticket scaffoldé.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LifeBuoy className="size-4" /> Besoin d&apos;aide ?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-1.5 text-sm">
            <p>• <strong>Support</strong> : ouvre un ticket, le super-admin le résout.</p>
            <p>• <strong>Discord</strong> : annuaire d&apos;équipe + messages directs.</p>
            <p>• <strong>rebuild216 CLI</strong> : guide d&apos;installation détaillé.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
