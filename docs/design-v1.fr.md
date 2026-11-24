# Worklens V1 — design du logiciel

Statut : proposition à sélectionner, 11 septembre 2026. Aucun écran applicatif modifié.

## Intention

**Comprendre son monorepo et examiner son évolution sans perdre le contexte.**

La V1 comporte exactement trois espaces : Overview, Architecture, Git.
Le dépôt est le contexte global ; le worktree est le contexte d'observation ;
le composant et le fichier sont les objets que l'on explore.
La puissance repose sur leurs relations et sur la continuité entre les vues.

Les premières pistes ont été rejetées car trop anciennes visuellement.
La nouvelle direction privilégie une surface lisible, une navigation courte,
des détails à la demande et des interactions rapides. Le thème clair ou sombre
ne suffit pas à définir la modernité : les comportements ci-dessous sont communs.

## Périmètre

| Espace | Question | Contenu principal | Passage naturel |
| --- | --- | --- | --- |
| Overview | Où en est mon dépôt local ? | Worktree actif, changements observés, composants, disponibilité des sources | Ouvrir un composant ou les changements |
| Architecture | De quoi est composé le projet et qui dépend de quoi ? | Graphe et liste équivalente, recherche, relations et propriétés | Examiner les fichiers modifiés du composant |
| Git | Qu'est-ce qui a changé dans ce worktree ? | Fichiers, diff, branches, worktrees, historique local | Retrouver le composant du fichier |

PR, CI, agents, fiches de travail et centre de documents sont hors de cette V1.
Les paramètres restent un utilitaire discret, pas un quatrième espace produit.
Git reste une observation locale : sélectionner un worktree ne fait pas de checkout.
Pas de fetch, indexation, commit, push, installation ou exécution de cible.

## Shell et navigation

- Trois destinations stables, toujours visibles. Une barre supérieure ou latérale
  courte sera retenue selon la maquette choisie ; ne pas cumuler les deux.
- Sélecteurs de dépôt et de worktree nommés explicitement ; nom de branche seul
  insuffisant quand plusieurs worktrees partagent un contexte similaire.
- La recherche globale trouve composants, fichiers observés et worktrees ;
  les filtres locaux restent attachés à leur vue. Leur portée est visible.
- Une sélection révèle un inspecteur refermable. Il n'occupe pas un tiers de
  l'écran en permanence et ne masque pas l'objet sélectionné.
- Un clic sélectionne, Entrée ouvre le détail, Échap le ferme et rend le focus.
  Les actions importantes disposent d'un bouton ou d'un menu visible.
- Retour restaure filtre, sélection, défilement et cadrage du graphe.
- L'actualisation conserve le contenu pendant la collecte et expose ses erreurs.
  Si l'objet disparaît, signaler ce changement et rendre une sélection cohérente.

## Overview

Une vue d'orientation utile dès l'ouverture, sans slogan ni grille de compteurs.
Afficher une synthèse courte du worktree actif puis les composants explorables.
Une section « À examiner » apparaît seulement pour des faits utiles : changements
locaux, conflit observé, source partielle ou inaccessible. Un dépôt propre n'a pas
besoin d'une alerte ou d'une célébration.

Chaque ligne conduit à une action précise : « Examiner dans Git »,
« Voir dans Architecture », « Voir la source ». Ne pas déclarer le projet sain
sur la base du nombre de fichiers modifiés ou de l'absence de diagnostic.
Les changements comptent les chemins distincts du worktree actif ; un fichier
à la fois indexé et modifié n'est compté qu'une fois dans la synthèse.

La liste des worktrees affiche branche et chemin. Un nombre de changements par
worktree exige une collecte spécifique ; afficher « Non observé » sinon.
Le contrat Worktree actuel ne contient pas ce compteur.

## Architecture

Le graphe est une surface de travail extensible avec recherche, recentrage et
filtres. La sélection met en évidence les relations pertinentes ; les voisins
peuvent être explorés progressivement. La liste offre les mêmes objets et détails.

L'inspecteur expose chemin, écosystème réel, dépendances, dépendants et origine
des relations. A → B signifie « A dépend de B ». Les relations de contenance ou
d'identité ne sont jamais présentées comme des dépendances. Conserver les états
observé, déclaré, candidat. « Aucun observé » est distinct d'une preuve d'absence.
Les cibles sont consultables, jamais présentées comme des boutons d'exécution.

« Voir dans Git » conserve le worktree et applique un filtre explicite au composant.
Les fichiers sans composant identifié restent consultables sous « Hors composant ».
Ne pas masquer les fichiers transversaux, comme les manifests et lockfiles racine.
Une éventuelle estimation d'impact appartient au moteur partagé, pas à React.

## Git

L'entrée par défaut montre les changements du worktree sélectionné. Une liste de
fichiers et une lecture du diff forment la surface principale. Branches, worktrees
et historique sont des modes secondaires internes à Git.

- Séparer les états de l'index et de la copie de travail ; conserver les deux
  lorsqu'un même fichier est modifié à ces deux endroits.
- Libeller la comparaison : copie de travail ↔ index, ou index ↔ HEAD.
- Diff unifié prioritaire ; côte à côte seulement si le rendu peut être fidèle.
- Prévoir non suivi, renommé avec ancien chemin, supprimé, conflit, binaire,
  diff vide, tronqué et indisponible. Ne jamais transformer une erreur en diff vide.
- Les fichiers non suivis ne possèdent pas nécessairement un diff Git disponible.
- L'historique pagine ; un dépôt sans premier commit et HEAD détachée sont valides.
- Les références distantes sont locales : dire « observé », jamais « synchronisé ».
- « Voir le composant » restaure Architecture et sélectionne l'objet correspondant.

## Design system : fondations proposées

Valeurs de départ à confirmer après sélection visuelle, pas des tokens implémentés.

| Famille | Règle |
| --- | --- |
| Couleurs | Tokens surface, surface-subtle, text, text-muted, separator, selection, focus, danger, warning, diff-add, diff-remove ; thèmes clair et sombre |
| Palette claire | Surface #FAFAFA, texte #202124, secondaire #626875, accent #4666D5 |
| Palette sombre | Surface #141518, chrome #1B1D22, texte #F0F1F4, secondaire #A4A9B4, accent #B9A5FF |
| Typographie | Police système ; contenu 14 px, secondaire 12–13 px, titre 20–24 px ; monospace réservé aux chemins, SHA et diffs |
| Espacement | Base 4 px ; groupes 12/16/24 px ; lignes 40 px par défaut, 32 px en densité compacte |
| Surfaces | Séparation d'abord par alignement et espace ; rayons 6–8 px sur contrôles et surfaces transitoires ; ombre réservée aux overlays |
| Icônes | Lucide existant, 16–18 px ; libellé accessible et info-bulle pour chaque bouton sans texte |
| Mouvement | 120–180 ms pour sélection et ouverture ; aucune animation décorative ; mouvement réduit respecté |
| Fenêtres | Cible 1440×1024 ; vérifier 1024×720 et 1280×800 ; inspecteur rabattable et panneaux redimensionnables |

L'accent exprime la sélection ; les couleurs d'état expriment un fait et sont
toujours accompagnées d'un texte ou d'un symbole. Contraste à mesurer au prototype.
Un thème sombre ne doit pas affaiblir les textes secondaires ou les lignes du diff.

## Composants à construire

| Composant | Responsabilité | États ou interactions obligatoires |
| --- | --- | --- |
| WorkspaceShell | Navigation et contexte partagé | Aucun dépôt, dépôt ouvert, changement de dépôt |
| RepositorySwitcher / WorktreePicker | Choisir le contexte observé | Recherche, chemin distinctif, HEAD détachée, indisponible |
| CommandPalette | Recherche et navigation rapides | ⌘/Ctrl K, clavier, aucun résultat, portée explicite |
| ViewToolbar | Recherche locale, filtres, actualisation | Filtre actif et effaçable, collecte en cours, erreur |
| ObjectList / ObjectRow | Composants, fichiers, worktrees | Repos, survol, sélection, focus distinct, liste vide |
| SplitPane / ContextInspector | Détail progressif | Fermé, ouvert, redimensionné, focus rendu au déclencheur |
| SourceStatus | Fraîcheur de chaque source | Chargement, disponible, partiel, ancien, indisponible |
| ComponentNode / RelationDetail | Lecture du graphe | Sélection, relation déclarée/observée/candidate, chemin accessible |
| FileChangeRow | Statut Git et appartenance | Index et copie de travail distincts, renommage, conflit, non suivi |
| DiffViewer | Comparaison en lecture seule | Vide, texte, binaire, tronqué, erreur ; sélection et copie |
| EmptyState / InlineError | Expliquer et permettre de reprendre | Message local précis, action adaptée, données précédentes préservées |

Réutiliser les primitives accessibles existantes Button, Input, Dialog, Tabs,
Tooltip et ScrollArea. Les composants du domaine composent ces primitives ;
les règles métiers restent dans le moteur commun desktop/CLI/MCP.

## État partagé et accessibilité

L'état de navigation associe repositoryId, worktreeId, vue, componentId éventuel,
chemin éventuel et mode de comparaison. Chaque vue mémorise ses filtres et sa
position dans ce contexte. Au changement de dépôt, invalider les identités du
précédent. Une réponse tardive d'un autre worktree ne remplace pas la vue courante.

Tout est utilisable au clavier : ordre de tabulation logique, focus visible,
menus accessibles, séparateurs redimensionnables au clavier. Le graphe possède
une alternative liste ; aucun contenu essentiel n'exige survol ou glisser-déposer.
Échap ferme uniquement la couche active. Les raccourcis de navigation ne doivent
pas intercepter la saisie dans les champs. Prévoir zoom texte et chemins longs.

## Livraison et validation futures

1. Choisir la direction visuelle parmi les trois nouvelles propositions.
2. Décliner le même langage sur les trois vues et un catalogue des composants
   avec leurs états ; valider au clavier et dans la fenêtre native Tauri.
3. Implémenter shell et Overview, puis Architecture et Git sur les contrats réels.
4. Vérifier le parcours Overview → composant → Git → retour Architecture ;
   aucun filtre, worktree ou cadrage perdu. Vérifier source indisponible, cache
   ancien, dépôt sans commit, conflit et diff tronqué.

Ce livrable est une spécification et une exploration visuelle : ni bibliothèque
React livrée, ni audit visuel de l'application, ni fonctionnalité validée.
Les images utilisent des données fictives et ne font pas autorité sur les contrats.
En particulier, corriger à l'implémentation les chemins ou badges inventés par
la génération, « synchronisation » en « observation », les slogans et les éventuels
dégradés. Références inspectées : shell, overview, architecture, styles, contrats
GitSnapshot/Worktree/FileChange/DiffResult/Graph et architecture Rust partagée
du checkout de travail au 11 septembre 2026. La PR de conception part de main
pour rester indépendante des modifications applicatives non commitées.
