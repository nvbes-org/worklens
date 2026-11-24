import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

interface ShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Commandes & Palette',
    items: [
      { keys: ['⌘', 'P'], description: 'Ouvrir la palette de commandes omni' },
      { keys: ['⌘', '.'], description: 'Afficher / masquer le volet Toolbelt' },
      { keys: ['⌘', 'K'], description: 'Effacer l’écran du terminal' },
      { keys: ['⌘', '?'], description: 'Afficher ce guide de raccourcis' },
    ],
  },
  {
    title: 'Panneaux & Découpage (Splits)',
    items: [
      { keys: ['⌘', 'D'], description: 'Diviser le panneau verticalement (Split Right)' },
      { keys: ['⌘', '⇧', 'D'], description: 'Diviser le panneau horizontalement (Split Down)' },
      { keys: ['⌘', '⇧', '↵'], description: 'Mode Stack : Zoom plein écran sur le panneau actif' },
      { keys: ['⌥', '← / → / ↑ / ↓'], description: 'Changer le focus entre les panneaux' },
      { keys: ['⌘', 'W'], description: 'Fermer le panneau actif' },
    ],
  },
  {
    title: 'Onglets',
    items: [
      { keys: ['⌘', 'T'], description: 'Créer un nouvel onglet de terminal' },
      { keys: ['⌘', '1 … 9'], description: 'Basculer directement vers l’onglet 1 à 9' },
    ],
  },
  {
    title: 'Architecture en Blocs',
    items: [
      { keys: ['⌘', '↑'], description: 'Sauter à l’invite de commande précédente' },
      { keys: ['⌘', '↓'], description: 'Sauter à l’invite de commande suivante' },
      { keys: ['⌘', '⇧', 'C'], description: 'Copier le bloc actif au format Markdown' },
      { keys: ['⌘', '⇧', 'F'], description: 'Replier / déplier la sortie du bloc' },
    ],
  },
  {
    title: 'Productivité Avancée',
    items: [
      { keys: ['⌘', '⇧', 'Espace'], description: 'Activer le mode QuickSelect (indices à 2 lettres)' },
      { keys: ['⌘', 'F'], description: 'Recherche textuelle / regex dans le scrollback' },
    ],
  },
];

export function AuroraShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#090d16]/95 border-white/[0.1] backdrop-blur-xl text-slate-100 p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>⚡ Guide des Raccourcis AuroraTerm</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Contrôle intégral au clavier poussé au maximum sans toucher à la souris.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
                {section.title}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {section.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]"
                  >
                    <span className="text-xs text-slate-300">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-1.5 py-0.5 rounded bg-white/[0.1] border border-white/[0.15] text-[10px] font-mono text-slate-200 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
