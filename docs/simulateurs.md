# Documentation des simulateurs

## 1. Calculateur d'impôt sur le revenu (TMI)

### Objectif
Déterminer la **tranche marginale d'imposition (TMI)** et l'impôt théorique d'un foyer fiscal à partir de ses revenus (salaires, micro-entreprise, dividendes).

### Sources de revenus

| Source | Input | Traitement |
|---|---|---|
| Salaires nets imposables | `salaire` | Intégration directe au revenu imposable |
| Micro-entreprise (CA) | `micro-ca` + `micro-type` | Abattement forfaitaire (vente 71%, service 50%, BNC 34%) |
| Dividendes bruts | `div-brut` + `div-mode` | PFU 30% **ou** barème avec abattement 40% |

### Quotient familial (QF)

```
QF = Revenu imposable total / Nombre de parts
```

Le nombre de parts dépend de la situation familiale (célibataire = 1, couple = 2, demi-part par enfant).

### Barème IR

Barèmes 2024–2026 chargés depuis `data/baremes.json` (fallback inline) :

| Année | Tranche 1 | Tranche 2 | Tranche 3 | Tranche 4 | Tranche 5 |
|---|---|---|---|---|---|
| 2024 | 0% ≤11 294€ | 11% ≤28 797€ | 30% ≤82 341€ | 41% ≤177 106€ | 45% >177 106€ |
| 2025 | 0% ≤11 497€ | 11% ≤29 315€ | 30% ≤83 823€ | 41% ≤180 660€ | 45% >180 660€ |
| 2026 | 0% ≤11 818€ | 11% ≤30 144€ | 30% ≤86 060€ | 41% ≤185 320€ | 45% >185 320€ |

### Dividendes — deux modes

- **Flat tax / PFU (30%)** : les dividendes ne sont **pas** intégrés au barème IR. Ils n'affectent pas la TMI. L'impôt est de 30% à la source.
- **Barème progressif (régime réel)** : les dividendes sont intégrés avec un abattement de 40% sur le brut. Ils participent au calcul de la TMI.

### Sorties

- Revenu imposable total
- Quotient familial
- Impôt théorique IR
- Taux moyen d'imposition
- TMI (dernière tranche active)
- Modal avec détail tranche par tranche

### Persistance

- 5 simulations max par navigateur (LRU pruning).
- Nommage + suppression possible.
- Auto-recalc après la première saisie.

---

## 2. Comparateur immobilier — Acheter vs Louer + Investir

### Objectif
Comparer le patrimoine net accumulé sur un horizon donné entre deux stratégies :
- **Achat** d'un bien avec crédit
- **Location** du même type de bien + placement de l'argent épargné

### Hypothèses achat

| Paramètre | Défaut | Description |
|---|---|---|
| Prix du bien | 300 000 € | Valeur d'acquisition |
| Frais de notaire | 8% (auto-calc) | Calculé automatiquement en % du prix |
| Apport | 50 000 € | Capital personnel injecté |
| Taux crédit | 3.5% | Taux annuel du prêt immobilier |
| Durée crédit | 20 ans | Amortissement constant |
| Travaux | 0 € | Investissement initial hors prix |
| Entretien annuel | 1 500 € | Charges courantes propriétaire |
| Taxe foncière | 1 200 € | Impôt local annuel |
| Plus-value annuelle | 3% | Hausse de la valeur du bien |

### Hypothèses location

| Paramètre | Défaut | Description |
|---|---|---|
| Loyer mensuel | 1 200 € | Loyer payé chaque mois |
| Charges locatives | 100 € | Charges mensuelles locatives |
| Rendement placement | 5% | Rendement annuel du portefeuille financier |
| Horizon | 20 ans | Durée de comparaison |

### Inflation des dépenses

| Variable | Indexée chaque année |
|---|---|
| Loyer | Oui |
| Charges locatives | Oui |
| Taxe foncière | Oui |
| Entretien | Oui |
| Mensualité crédit | Non — taux fixe |
| Plus-value du bien | Non — paramètre propre |
| Rendement placement | Non — nominal |

**Mode standard** (défaut) : un seul champ "Inflation globale" (2% par défaut) appliqué aux 4 variables ci-dessus.

**Mode avancé** : checkbox révélant 4 champs séparés (utile pour modéliser un loyer indexé IRL ≈ 1.5% à part d'une taxe foncière indexée à 3-4%).

### Formules clés

**Mensualité de crédit** (amortissement standard) :
```
M = K × i / (1 - (1+i)^-n)
K = prix + notaire + travaux - apport
i = taux_annuel / 12
n = duree_annees × 12
```

**Capital restant dû (CRD)** après t années :
```
CRD(t) = K × ((1+i)^n - (1+i)^(t×12)) / ((1+i)^n - 1)
```

**Patrimoine achat** à l'année t :
```
ValeurBien(t) = (prix + travaux) × (1 + plus_value)^t
PatrimoineAchat(t) = ValeurBien(t) - CRD(t) + potAcheteur(t)
```

**Patrimoine location** à l'année t :
```
CapitalInitial = apport   (apples-to-apples : même cash que l'acheteur sort au signing)
potLoc(0) = CapitalInitial
potLoc(t) = (potLoc(t-1) + EconomieAnnuelle) × (1 + rendement)
PatrimoineLoc(t) = potLoc(t)
```

### Logique de cash-flow (différence de dépenses)

```
DepenseAchat(t) = (t < dureeCredit ? mensualite : 0) × 12 + entretien(t) + taxe(t)
DepenseLoc(t)  = loyer(t) × 12 + charges_locatives(t) × 12
Diff(t)        = DepenseAchat(t) - DepenseLoc(t)

avec indexation annuelle :
  loyer(t)      = loyer × (1 + inflation_loyer)^t
  charges(t)    = charges_locatives × (1 + inflation_charges)^t
  taxe(t)       = taxe_fonciere × (1 + inflation_taxe)^t
  entretien(t)  = entretien × (1 + inflation_entretien)^t
```

- Si **Diff > 0** : le locataire dépense **moins** → il place `Diff` chaque année.
- Si **Diff < 0** : l'acheteur dépense **moins** → il place `|Diff|` chaque année.
- Si **Diff = 0** : pas d'économie de part et d'autre.

**Cessation des mensualités** : pour les années `t >= dureeCredit`, la mensualité passe à 0. Le cash-flow acheteur se réduit alors à `entretien + taxe_fonciere`. Sur les horizons plus longs que la durée du crédit, l'avantage cash-flow bascule typiquement côté acheteur après la fin du crédit.

Les deux "pots" (épargne acheteur et épargne locataire) capitalisent au **même rendement** défini dans les paramètres location.

### Fiscalité du placement

Une case "Appliquer la flat tax (PFU 30 %)" permet d'imposer les plus-values du placement à 30 % (12,8 % IR + 17,2 % prélèvements sociaux). Quand activée :

```
gains(t)    = max(0, pot(t) − capital_investi(t))
tax(t)      = gains(t) × 30 %
pot_net(t)  = pot(t) − tax(t)
```

S'applique aux **deux** pots (locataire ET acheteur côté placement). La plus-value du bien immobilier reste hors scope (régime fiscal propre, non modélisé).

**Stratégies de purge fiscale** (non modélisées, ajuster manuellement) :
- **PEA** — exonération d'IR après 5 ans (les 17,2 % de PS restent dus)
- **Assurance-vie** — abattement 4 600 € (célibataire) / 9 200 € (couple) après 8 ans
- **Donation** — purge totale de la plus-value latente lors de la transmission
- **PER** — déduction à l'entrée, fiscalité reportée à la sortie

### Limites et hypothèses simplificatrices

- Pas de fiscalité (IFI, plus-value immobilière, prélèvements sociaux sur le placement — sauf si flat tax activée).
- Pas de variation du rendement placement sur l'horizon.
- Crédit à taux fixe sur toute la durée.
- Les travaux sont intégrés dans la valeur du bien (pas de valeur résiduelle séparée).

---

## 3. Simulateur de rentabilité locative

### Objectif
Analyser la **rentabilité brute et nette** d'un bien locatif, ainsi que le cash-flow mensuel, le coût total du crédit et la valeur de revente estimée sur un horizon de 20 ans.

### Paramètres

| Zone | Paramètre | Défaut | Description |
|---|---|---|---|
| **Bien** | Prix du bien FAI | 200 000 € | Prix d'acquisition frais d'agence inclus |
| | Frais de notaire | 7 % | Calculé en % du prix |
| | Frais d'agence | 0 % | Calculé en % du prix |
| | Travaux | 0 € | Investissement initial hors prix |
| | Meubles | 0 € | Ameublement (meublé) |
| | Superficie | 50 m² | Surface du logement (indicatif) |
| | Inflation revente | 2 % | Hausse annuelle de la valeur de revente |
| **Revenus** | Loyer mensuel | 900 € | Loyer perçu chaque mois |
| | Vacance locative | 1 mois/an | Période sans locataire (mois/an ou années) |
| | Augmentation loyer | 1.5 % | Indexation annuelle du loyer |
| **Charges** | Charges de copro | 0 €/mois | Charges communes |
| | Assurance PNO | 0 €/mois | Assurance propriétaire non occupant |
| | Comptabilité / CGA | 0 €/mois | Frais de gestion comptable |
| | Frais bancaires | 0 €/mois | Frais de compte courant |
| | Eau / Élec / Gaz / Internet | 0 €/mois | Charges récupérables ou non |
| | CFE | 0 €/mois | Contribution foncière des entreprises |
| | Taxe foncière | 0 €/mois | Impôt local annuel |
| | Charges diverses | 0 €/mois | Autres charges |
| **Crédit** | Apport | 40 000 € | Capital personnel injecté |
| | Durée | 240 mois | Durée totale du prêt |
| | Taux emprunt | 3.5 % | Taux annuel du crédit immobilier |
| | Taux assurance | 0.3 % | Taux annuel de l'assurance emprunteur |
| | Différé | Aucun | Partiel (intérêts seuls) ou Total (0 € + capitalisation) |
| | Frais de dossier | 500 € | Frais bancaires de montage |
| | Garantie | 0 € | Garantie hypothécaire ou caution |

### Formules clés

**Total acquisition** :
```
Total = prix + travaux + meubles + notaire + agence + frais_dossier + garantie
```

**Montant à emprunter** :
```
K = Total − apport
```

**Mensualité de crédit** (amortissement constant) :
```
M = K × i / (1 − (1+i)^−n)
i = taux_annuel / 12
n = durée en mois
```

**Différé de crédit** :
- **Aucun** : amortissement standard dès le premier mois.
- **Partiel** : pendant `d` mois, mensualité = intérêts seuls (`K × i`). Le capital reste constant. Après le différé, amortissement standard sur la durée restante.
- **Total** : pendant `d` mois, mensualité = 0 €. Les intérêts mensuels sont capitalisés (`K ← K × (1+i)`). Après le différé, amortissement standard sur le capital majoré et la durée restante.

**Mensualité assurance emprunteur** :
```
Assurance = K × taux_assurance / 12
```

**Coût total du prêt** :
```
Coût = K + Σ(intérêts) + Σ(assurance) + frais_dossier + garantie
```

**Rentabilité brute** :
```
Brute = (loyer_annuel_effectif / Total) × 100
```

**Rentabilité nette** :
```
Nette = ((loyer_annuel_effectif − charges_annuelles) / Total) × 100
```

**Cash-flow mensuel** :
```
CF = loyer_mensuel × (1 − vacance) − charges_mensuelles − mensualité_totale
```

**Valeur de revente estimée** :
```
Revente(t) = Total × (1 + inflation_revente)^t
```

### Charges — unités

Chaque poste de charges peut être saisi en **€/mois** ou **€/an**. Le simulateur convertit automatiquement en annuel pour le calcul de la rentabilité nette, et en mensuel pour le cash-flow.

### Vacance locative

La vacance peut être exprimée en **mois par an** (ex. 1 mois → 8.3 % de vacance) ou en **années** (ex. 0.33 an → 4 mois). Le loyer effectif est ajusté en conséquence.

### Limites et hypothèses

- **Pas de fiscalité immobilière modélisée** : pas d'amortissement, pas de choix entre régimes (LMNP, SCI IS, micro, réel). Le simulateur se concentre sur la rentabilité financière pure.
- **Pas d'inflation des charges** : les charges restent constantes sur l'horizon.
- **Crédit à taux fixe** sur toute la durée.
- **Loyer indexé** uniquement par le % d'augmentation annuel.
- **Revente** calculée par inflation simple, sans modélisation de plus-value immobilière ni fiscalité de cession.

### Sorties

- Rentabilité brute (%)
- Rentabilité nette (%)
- Mensualité de crédit (€)
- Cash-flow mensuel (€)
- Montant emprunté (€)
- Coût total du prêt (€)
- Graphique : valeur de revente estimée sur 20 ans
- Tableau synthèse : Année 2, 5, 15, 20 — mensualité, cash-flow, revente, rentabilité nette

---

## 4. Comparateur multi-investissements

### Objectif (à venir)
Comparer 2 à 3 types de placements (ETF, SCPI, assurance-vie, PER, crypto, etc.) sur un horizon temporel donné, en intégrant fiscalité, frais de gestion et rendement net.

### Paramètres envisagés

| Placement | Rendement | Frais | Fiscalité sortie |
|---|---|---|---|
| PEA/ETF | ~7-8% | Faibles | 0% après 5 ans (plafond) |
| Assurance-vie (fonds euros) | ~2-3% | Gestion | Abattement selon ancienneté |
| SCPI | ~4-6% | Acquisition | Revenus fonciers / IR |
| PER | Variable | Gestion | Déductible entrée, imposition sortie |

### Sorties envisagées

- Graphe comparatif de la valeur liquidative nette par année
- Tableau avec capital, intérêts composés, frais cumulés, impôts
- Scénario "tout retirer en une fois" vs "rente programmée"
