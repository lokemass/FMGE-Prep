import crypto from 'crypto';
import type { PaperType } from '../constants/examStructure.ts';

export type OptionKey = 'A' | 'B' | 'C' | 'D';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type QuestionSource = 'pyq' | 'ai_generated';

export interface QuestionOption {
  key: OptionKey;
  text: string;
}

export interface QuestionExplanation {
  whyCorrect: string;
  whyOthersWrong: Record<OptionKey, string>;
  questionConcept: string;
  highYieldPoint: string;
  mnemonic?: string;
}

export interface QuestionSeedItem {
  paper: PaperType;
  subject: string;
  topic: string;
  question: string;
  options: QuestionOption[];
  correctKey: OptionKey;
  explanation: QuestionExplanation;
  difficulty: DifficultyLevel;
  source: QuestionSource;
  pyqYear: number | null;
  verified: boolean;
  tags: string[];
}

export function normalizeQuestionHash(questionText: string): string {
  const normalized = questionText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export const SAMPLE_QUESTIONS: QuestionSeedItem[] = [
  // 1. Anatomy (Morning)
  {
    paper: 'morning',
    subject: 'Anatomy',
    topic: 'Upper Limb & Brachial Plexus',
    question:
      'A 28-year-old man sustains a mid-shaft fracture of the humerus after a road traffic accident. On examination, he is unable to extend his wrist and fingers and has sensory loss over the first dorsal web space. Which nerve is most likely injured?',
    options: [
      { key: 'A', text: 'Median nerve' },
      { key: 'B', text: 'Ulnar nerve' },
      { key: 'C', text: 'Radial nerve' },
      { key: 'D', text: 'Axillary nerve' },
    ],
    correctKey: 'C',
    explanation: {
      whyCorrect:
        'The radial nerve courses tightly along the spiral (radial) groove on the posterior aspect of the humeral mid-shaft. Injury here causes paralysis of the wrist and finger extensors (wrist drop) and sensory loss over the autonomous zone—the first dorsal web space.',
      whyOthersWrong: {
        A: 'Median nerve injury occurs in supracondylar fractures or carpal tunnel syndrome, presenting with ape-thumb deformity and sensory loss on the palmar lateral 3.5 digits.',
        B: 'Ulnar nerve is injured behind the medial epicondyle or at Guyon canal, presenting with claw hand and sensory loss over the medial 1.5 digits.',
        C: 'Correct option: radial nerve injury at the spiral groove causes classic wrist drop and first dorsal web space anesthesia.',
        D: 'Axillary nerve wraps around the surgical neck of the humerus and supplies the deltoid and regimental badge area.',
      },
      questionConcept:
        'Peripheral nerve anatomy relative to humeral fracture landmarks (surgical neck = axillary, mid-shaft/spiral groove = radial, medial epicondyle = ulnar).',
      highYieldPoint:
        'Mid-shaft humeral fracture injures the radial nerve in the spiral groove, sparing the triceps (branches given off earlier) while causing wrist drop.',
      mnemonic: 'ARM: Axillary (surgical neck), Radial (mid-shaft), Median (supracondylar).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['brachial plexus', 'humerus fracture', 'wrist drop', 'nerve injury'],
  },
  // 2. Anatomy (Morning)
  {
    paper: 'morning',
    subject: 'Anatomy',
    topic: 'Embryology & Pharyngeal Arches',
    question:
      'Which of the following structures develops from the third pharyngeal pouch?',
    options: [
      { key: 'A', text: 'Palatine tonsil' },
      { key: 'B', text: 'Inferior parathyroid gland and thymus' },
      { key: 'C', text: 'Superior parathyroid gland' },
      { key: 'D', text: 'Eustachian tube and tympanic cavity' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'The third pharyngeal pouch gives rise to the inferior parathyroid glands (from its dorsal wing) and the thymus (from its ventral wing). Because the thymus migrates caudally into the mediastinum, it pulls the inferior parathyroids below the superior ones.',
      whyOthersWrong: {
        A: 'The palatine tonsil develops from the second pharyngeal pouch.',
        B: 'Correct option: 3rd pouch forms the thymus and inferior parathyroid glands; failure leads to DiGeorge syndrome (22q11.2 deletion).',
        C: 'Superior parathyroid glands and ultimobranchial body (parafollicular C-cells) arise from the fourth pharyngeal pouch.',
        D: 'The auditory (Eustachian) tube and middle ear cavity develop from the first pharyngeal pouch.',
      },
      questionConcept:
        'Derivatives of the pharyngeal (branchial) pouches and their clinical correlation with DiGeorge syndrome.',
      highYieldPoint:
        '3rd pouch = Thymus + Inferior parathyroids; 4th pouch = Superior parathyroids + parafollicular C-cells.',
      mnemonic: '3rd pouch migrates FURTHER down (Inferior parathyroids + Thymus in chest).',
    },
    difficulty: 'medium',
    source: 'ai_generated',
    pyqYear: null,
    verified: false,
    tags: ['embryology', 'pharyngeal pouch', 'DiGeorge'],
  },
  // 3. Physiology (Morning)
  {
    paper: 'morning',
    subject: 'Physiology',
    topic: 'Respiratory Physiology',
    question:
      'Which of the following physiological changes shifts the oxygen-hemoglobin dissociation curve to the right, facilitating oxygen unloading to peripheral tissues?',
    options: [
      { key: 'A', text: 'Decreased arterial pH and increased 2,3-BPG' },
      { key: 'B', text: 'Hypothermia and metabolic alkalosis' },
      { key: 'C', text: 'Presence of fetal hemoglobin (HbF)' },
      { key: 'D', text: 'Carbon monoxide poisoning' },
    ],
    correctKey: 'A',
    explanation: {
      whyCorrect:
        'A right shift increases P50 (lower oxygen affinity), promoting O2 release to metabolically active tissues. Acidosis (low pH / high H+), hypercapnia (high CO2), increased temperature, and elevated 2,3-BPG all stabilize the taut (T) deoxygenated state of hemoglobin.',
      whyOthersWrong: {
        A: 'Correct option: high H+ (Bohr effect) and high 2,3-BPG shift the curve right.',
        B: 'Hypothermia and alkalosis increase Hb affinity for O2, shifting the curve to the left.',
        C: 'HbF binds 2,3-BPG poorly (gamma chains lack the binding histidine), shifting the curve left to extract O2 from maternal blood.',
        D: 'Carbon monoxide binds Hb with ~240x affinity and shifts the remaining O2-binding sites to the left, impairing unloading.',
      },
      questionConcept:
        'Bohr effect and allosteric regulation of hemoglobin oxygen affinity.',
      highYieldPoint:
        'Active exercising muscle is hot, acidic, and high in CO2—all three shift the O2-Hb curve RIGHT for O2 release.',
      mnemonic: 'CADET, face RIGHT! (CO2, Acid, 2,3-DPG, Exercise, Temperature).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2022,
    verified: true,
    tags: ['Bohr effect', 'oxygen dissociation', '2,3-BPG'],
  },
  // 4. Physiology (Morning)
  {
    paper: 'morning',
    subject: 'Physiology',
    topic: 'Cardiovascular Physiology & ECG',
    question:
      'During the normal cardiac cycle, the "c" wave of the jugular venous pulse (JVP) corresponds to which mechanical event?',
    options: [
      { key: 'A', text: 'Atrial contraction against an open tricuspid valve' },
      { key: 'B', text: 'Bulging of the closed tricuspid valve into the right atrium during isovolumetric ventricular contraction' },
      { key: 'C', text: 'Passive venous filling of the right atrium against a closed tricuspid valve' },
      { key: 'D', text: 'Rapid passive emptying of the right atrium after tricuspid valve opening' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'At the onset of ventricular systole (isovolumetric contraction), rising right ventricular pressure forces the closed tricuspid valve cusps upward into the right atrium, producing the small positive "c" wave on the JVP tracing.',
      whyOthersWrong: {
        A: 'Atrial contraction produces the "a" wave (absent in atrial fibrillation, prominent "cannon a" waves in complete heart block).',
        B: 'Correct option: right ventricular isovolumetric contraction bulges the tricuspid valve into the right atrium, generating the c wave.',
        C: 'Passive right atrial filling against a closed tricuspid valve during late ventricular systole produces the "v" wave.',
        D: 'Rapid emptying of the right atrium once the tricuspid valve opens produces the "y" descent.',
      },
      questionConcept:
        'Correlation between jugular venous pulse waveforms (a, c, x, v, y) and phases of the Wiggers cardiac cycle.',
      highYieldPoint:
        'a = atrial contraction, c = tricuspid valve bulge (IVC), x = atrial relaxation, v = venous filling, y = passive ventricular filling.',
      mnemonic: 'C = Cusps bulging in Contraction.',
    },
    difficulty: 'medium',
    source: 'ai_generated',
    pyqYear: null,
    verified: false,
    tags: ['JVP', 'cardiac cycle', 'Wiggers diagram'],
  },
  // 5. Biochemistry (Morning)
  {
    paper: 'morning',
    subject: 'Biochemistry',
    topic: 'Vitamins & Minerals',
    question:
      'A 45-year-old man with chronic alcohol use disorder presents with confusion, horizontal nystagmus, and truncal ataxia. Erythrocyte transketolase activity increases markedly upon addition of a cofactor. Which vitamin deficiency is responsible?',
    options: [
      { key: 'A', text: 'Vitamin B1 (Thiamine)' },
      { key: 'B', text: 'Vitamin B3 (Niacin)' },
      { key: 'C', text: 'Vitamin B6 (Pyridoxine)' },
      { key: 'D', text: 'Vitamin B12 (Cobalamin)' },
    ],
    correctKey: 'A',
    explanation: {
      whyCorrect:
        'The classic triad of encephalopathy (confusion), ophthalmoplegia/nystagmus, and ataxia defines Wernicke encephalopathy due to thiamine (B1) deficiency. Thiamine pyrophosphate (TPP) is an essential cofactor for RBC transketolase in the HMP shunt, pyruvate dehydrogenase, and alpha-ketoglutarate dehydrogenase.',
      whyOthersWrong: {
        A: 'Correct option: RBC transketolase activation assay confirms thiamine deficiency; always give IV thiamine before dextrose.',
        B: 'Niacin (B3) deficiency causes pellagra (3 Ds: Dermatitis, Diarrhea, Dementia).',
        C: 'Pyridoxine (B6) deficiency causes sideroblastic anemia, peripheral neuropathy (e.g., with isoniazid), and seizures in infants.',
        D: 'Vitamin B12 deficiency causes megaloblastic anemia with subacute combined degeneration of the spinal cord and elevated methylmalonic acid.',
      },
      questionConcept:
        'Enzymatic cofactors of thiamine pyrophosphate and biochemical diagnosis of Wernicke encephalopathy.',
      highYieldPoint:
        'Always administer IV thiamine BEFORE glucose in malnourished/alcoholic patients to avoid precipitating acute Wernicke encephalopathy.',
      mnemonic: 'Wernicke COA: Confusion, Ophthalmoplegia, Ataxia; TPP enzymes = ATP (Alpha-KG DH, Transketolase, Pyruvate DH).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2024,
    verified: true,
    tags: ['thiamine', 'Wernicke', 'transketolase', 'vitamins'],
  },
  // 6. Pathology (Morning)
  {
    paper: 'morning',
    subject: 'Pathology',
    topic: 'Hematology & Coagulation Disorders',
    question:
      'A 34-year-old man presents with massive splenomegaly and a total leukocyte count of 145,000/µL with myeloid cells at all stages of maturation (myelocytes, metamyelocytes, bands, and neutrophils) and marked basophilia. Leukocyte alkaline phosphatase (LAP) score is very low. Which chromosomal translocation is diagnostic?',
    options: [
      { key: 'A', text: 't(15;17)' },
      { key: 'B', text: 't(8;14)' },
      { key: 'C', text: 't(9;22)' },
      { key: 'D', text: 't(11;14)' },
    ],
    correctKey: 'C',
    explanation: {
      whyCorrect:
        'Chronic myeloid leukemia (CML) features marked leukocytosis with a "garden party" peripheral smear (all granulocytic stages), basophilia, massive splenomegaly, and a low LAP score (distinguishing it from a leukemoid reaction). It is driven by the Philadelphia chromosome t(9;22)(q34;q11) creating the BCR-ABL1 tyrosine kinase fusion.',
      whyOthersWrong: {
        A: 't(15;17) PML-RARA is characteristic of acute promyelocytic leukemia (AML-M3), which presents with Auer rods and DIC.',
        B: 't(8;14) c-MYC translocation is seen in Burkitt lymphoma ("starry sky" histology).',
        C: 'Correct option: t(9;22) BCR-ABL1 defines CML and is targeted by tyrosine kinase inhibitors like imatinib.',
        D: 't(11;14) Cyclin D1 overexpression is diagnostic of mantle cell lymphoma.',
      },
      questionConcept:
        'Cytogenetics and peripheral smear differentiation of CML versus leukemoid reaction.',
      highYieldPoint:
        'Low LAP score + basophilia + massive splenomegaly = CML with t(9;22) BCR-ABL1; first-line therapy is Imatinib.',
      mnemonic: 'CML = Low LAP, t(9;22) Philly.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['CML', 'Philadelphia chromosome', 'LAP score', 'hematology'],
  },
  // 7. Pathology (Morning)
  {
    paper: 'morning',
    subject: 'Pathology',
    topic: 'Inflammation, Repair & Amyloidosis',
    question:
      'A renal biopsy from a patient with long-standing rheumatoid arthritis and nephrotic-range proteinuria demonstrates acellular eosinophilic glomerular deposits that show apple-green birefringence under polarized light after Congo red staining. Which amyloid fibril protein is most likely deposited?',
    options: [
      { key: 'A', text: 'AL (immunoglobulin light chain)' },
      { key: 'B', text: 'AA (serum amyloid A)' },
      { key: 'C', text: 'A-beta2-microglobulin' },
      { key: 'D', text: 'ATTR (transthyretin)' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Secondary (reactive) systemic amyloidosis arises in chronic inflammatory conditions such as rheumatoid arthritis, tuberculosis, bronchiectasis, or ankylosing spondylitis. Persistent hepatic production of acute-phase reactant Serum Amyloid A (SAA) leads to AA fibril deposition, commonly presenting with renal nephrotic syndrome.',
      whyOthersWrong: {
        A: 'AL amyloidosis is primary amyloidosis associated with multiple myeloma or B-cell plasma cell dyscrasias.',
        B: 'Correct option: AA amyloidosis complicates chronic inflammatory/infectious diseases like RA and TB.',
        C: 'Beta-2 microglobulin amyloidosis occurs in patients undergoing long-term hemodialysis (carpal tunnel syndrome, arthropathy).',
        D: 'ATTR (transthyretin) causes senile systemic cardiac amyloidosis and familial amyloid polyneuropathy.',
      },
      questionConcept:
        'Classification of amyloidosis by precursor protein and underlying systemic disease.',
      highYieldPoint:
        'Congo red apple-green birefringence is pathognomonic of beta-pleated sheet amyloid; chronic inflammation (RA, TB) produces AA amyloid.',
      mnemonic: 'AA = Always Associated with chronic inflammation (RA, TB).',
    },
    difficulty: 'medium',
    source: 'ai_generated',
    pyqYear: null,
    verified: false,
    tags: ['amyloidosis', 'Congo red', 'rheumatoid arthritis'],
  },
  // 8. Microbiology (Morning)
  {
    paper: 'morning',
    subject: 'Microbiology',
    topic: 'Parasitology (Malaria, Leishmania, Helminths)',
    question:
      'A 26-year-old man from Bihar presents with a 3-month history of irregular fever, weight loss, darkening of skin, pancytopenia, and massive splenomegaly. Bone marrow aspirate reveals intracellular amastigotes with a rod-shaped kinetoplast inside macrophages. What is the vector for this infection?',
    options: [
      { key: 'A', text: 'Female Anopheles culicifacies' },
      { key: 'B', text: 'Female Phlebotomus argentipes' },
      { key: 'C', text: 'Aedes aegypti' },
      { key: 'D', text: 'Culex tritaeniorhynchus' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'The presentation of prolonged fever, hyperpigmentation ("kala-azar"), massive splenomegaly, pancytopenia, and LD (Leishman-Donovan) bodies (amastigotes with kinetoplasts) is classic visceral leishmaniasis caused by Leishmania donovani. In India, the vector is the female sandfly, Phlebotomus argentipes.',
      whyOthersWrong: {
        A: 'Female Anopheles transmits Plasmodium species (malaria).',
        B: 'Correct option: Phlebotomus argentipes (sandfly) transmits Kala-azar in India; single-dose Liposomal Amphotericin B is the drug of choice under NVBDCP.',
        C: 'Aedes aegypti transmits dengue, chikungunya, Zika, and yellow fever.',
        D: 'Culex tritaeniorhynchus is the vector for Japanese encephalitis.',
      },
      questionConcept:
        'Vector-borne parasitic diseases endemic to India and diagnostic morphology of LD bodies.',
      highYieldPoint:
        'Kala-azar (L. donovani): Vector = Phlebotomus argentipes; Diagnostic = LD bodies / rK39 dipstick; DOC in India = Single-dose Liposomal Amphotericin B.',
      mnemonic: 'Sandfly = Phlebotomus = Kala-azar (Bihar belt).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['kala-azar', 'leishmania', 'sandfly', 'parasitology'],
  },
  // 9. Microbiology (Morning)
  {
    paper: 'morning',
    subject: 'Microbiology',
    topic: 'Gram-Positive & Gram-Negative Bacteria',
    question:
      'A newborn develops meningitis on day 4 of life. Cerebrospinal fluid culture grows beta-hemolytic, catalase-negative, Gram-positive cocci in chains that are CAMP test positive and hippurate hydrolysis positive. What is the causative organism?',
    options: [
      { key: 'A', text: 'Streptococcus pyogenes' },
      { key: 'B', text: 'Streptococcus agalactiae' },
      { key: 'C', text: 'Streptococcus pneumoniae' },
      { key: 'D', text: 'Listeria monocytogenes' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Streptococcus agalactiae (Group B Streptococcus) is the leading cause of early-onset neonatal sepsis and meningitis. It is identified in the lab by beta-hemolysis, bacitracin resistance, hippurate hydrolysis positivity, and a positive arrowhead-shaped CAMP test with Staphylococcus aureus.',
      whyOthersWrong: {
        A: 'Streptococcus pyogenes (Group A) is bacitracin sensitive, PYR positive, and CAMP negative.',
        B: 'Correct option: Group B Strep (S. agalactiae) is CAMP positive, hippurate positive, and causes neonatal meningitis.',
        C: 'Streptococcus pneumoniae is alpha-hemolytic, optochin sensitive, and bile soluble.',
        D: 'Listeria monocytogenes is a Gram-positive rod (not coccus) showing tumbling motility at 25°C, though it can also be weakly CAMP positive.',
      },
      questionConcept:
        'Laboratory identification scheme for beta-hemolytic streptococci and pathogens of neonatal meningitis.',
      highYieldPoint:
        'Group B Streptococcus (S. agalactiae) = Bacitracin Resistant + CAMP Positive + Hippurate Positive.',
      mnemonic: 'B-BRAC: Group B = Babies, Bacitracin Resistant, Arrowhead CAMP.',
    },
    difficulty: 'medium',
    source: 'ai_generated',
    pyqYear: null,
    verified: false,
    tags: ['GBS', 'CAMP test', 'neonatal meningitis'],
  },
  // 10. Pharmacology (Morning)
  {
    paper: 'morning',
    subject: 'Pharmacology',
    topic: 'Antimicrobials, ATT & Antiretrovirals',
    question:
      'A 40-year-old patient on first-line anti-tubercular therapy (ATT) under NTEP complains of painless blurring of vision and difficulty distinguishing red and green colors after 6 weeks of treatment. Which drug is most likely responsible?',
    options: [
      { key: 'A', text: 'Isoniazid' },
      { key: 'B', text: 'Rifampicin' },
      { key: 'C', text: 'Pyrazinamide' },
      { key: 'D', text: 'Ethambutol' },
    ],
    correctKey: 'D',
    explanation: {
      whyCorrect:
        'Ethambutol causes dose-dependent retrobulbar optic neuritis, classically presenting with decreased visual acuity, central scotoma, and red-green color blindness (dyschromatopsia). It is usually reversible if detected early and discontinued promptly.',
      whyOthersWrong: {
        A: 'Isoniazid causes peripheral neuropathy (prevented by pyridoxine), hepatotoxicity, and drug-induced lupus.',
        B: 'Rifampicin causes orange-red discoloration of body fluids, hepatotoxicity, and potent CYP450 enzyme induction.',
        C: 'Pyrazinamide is the most hepatotoxic first-line ATT drug and causes hyperuricemia/gout.',
        D: 'Correct option: Ethambutol causes optic neuritis and red-green color vision loss.',
      },
      questionConcept:
        'Characteristic adverse drug reactions of first-line anti-tubercular drugs (HRZE).',
      highYieldPoint:
        'Ethambutol is the ONLY bacteriostatic first-line ATT drug and is linked to retrobulbar neuritis (red-green color loss).',
      mnemonic: 'E for Eye — Ethambutol causes Eye toxicity.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2024,
    verified: true,
    tags: ['ATT', 'NTEP', 'ethambutol', 'optic neuritis'],
  },
  // 11. Pharmacology (Morning)
  {
    paper: 'morning',
    subject: 'Pharmacology',
    topic: 'Autonomic Nervous System Drugs',
    question:
      'A farmer is brought to the emergency department with pinpoint pupils, profuse salivation, bronchorrhea, bradycardia, and muscle fasciculations after spraying insecticide. After securing the airway, which drug is given first to reverse life-threatening muscarinic bronchorrhea?',
    options: [
      { key: 'A', text: 'Atropine' },
      { key: 'B', text: 'Physostigmine' },
      { key: 'C', text: 'Pilocarpine' },
      { key: 'D', text: 'Neostigmine' },
    ],
    correctKey: 'A',
    explanation: {
      whyCorrect:
        'Organophosphate poisoning irreversibly inhibits acetylcholinesterase, causing a cholinergic crisis (DUMBELS). IV Atropine competitively blocks muscarinic receptors and rapidly dries bronchial secretions (the primary cause of death). Pralidoxime (2-PAM) is given alongside to reactivate AChE and reverse nicotinic fasciculations before enzyme aging occurs.',
      whyOthersWrong: {
        A: 'Correct option: Atropine is the primary life-saving muscarinic antagonist in organophosphate poisoning; titrate to clear lungs ("atropinization").',
        B: 'Physostigmine is a reversible cholinesterase inhibitor used for atropine/anticholinergic toxicity—it would worsen OP poisoning.',
        C: 'Pilocarpine is a direct muscarinic agonist used in glaucoma and Sjogren syndrome.',
        D: 'Neostigmine is a peripheral cholinesterase inhibitor used in myasthenia gravis and reversal of non-depolarizing neuromuscular blockade.',
      },
      questionConcept:
        'Emergency pharmacological management of organophosphate poisoning (muscarinic vs. nicotinic blockade).',
      highYieldPoint:
        'In OP poisoning, give Atropine first (end-point: clear lung fields/drying of secretions, NOT pupil dilatation alone) plus Pralidoxime for nicotinic symptoms.',
      mnemonic: 'DUMBELS cholinergic toxidrome -> Dry them up with Atropine.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2022,
    verified: true,
    tags: ['organophosphate', 'atropine', 'cholinergic crisis'],
  },
  // 12. Dermatology (Morning)
  {
    paper: 'morning',
    subject: 'Dermatology',
    topic: 'Vesiculobullous & Papulosquamous Disorders',
    question:
      'A 48-year-old woman presents with painful oral erosions followed by flaccid cutaneous bullae that rupture easily. Firm lateral pressure on normal-appearing perilesional skin produces epidermal shearing (positive Nikolsky sign). Direct immunofluorescence shows a "fish-net" intercellular IgG pattern. What is the diagnosis?',
    options: [
      { key: 'A', text: 'Bullous pemphigoid' },
      { key: 'B', text: 'Pemphigus vulgaris' },
      { key: 'C', text: 'Dermatitis herpetiformis' },
      { key: 'D', text: 'Erythema multiforme' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Pemphigus vulgaris is caused by autoantibodies against Desmoglein 3 (and Desmoglein 1), leading to intraepidermal suprabasal acantholysis ("row of tombstones" appearance). Clinically it presents with mucosal erosions, flaccid bullae, positive Nikolsky sign, and intercellular "fish-net" IgG deposition on DIF.',
      whyOthersWrong: {
        A: 'Bullous pemphigoid targets hemidesmosomal BP180/BP230, causing TENSE subepidermal bullae, negative Nikolsky sign, rare oral lesions, and linear basement membrane IgG.',
        B: 'Correct option: Pemphigus vulgaris = flaccid bullae + oral involvement + positive Nikolsky + fish-net DIF.',
        C: 'Dermatitis herpetiformis is linked to celiac disease, presenting with intensely pruritic grouped vesicles on elbows/knees and granular IgA at dermal papillae.',
        D: 'Erythema multiforme presents with characteristic iris/target lesions, most often triggered by HSV.',
      },
      questionConcept:
        'Differentiating intraepidermal (pemphigus) from subepidermal (pemphigoid) autoimmune blistering disorders.',
      highYieldPoint:
        'Pemphigus vulgaris: Desmoglein 3 antibodies, suprabasal split ("tombstone" basal layer), positive Nikolsky, fish-net IgG.',
      mnemonic: 'Pemphigus Vulgaris = Very flaccid, Very oral, Fish-net.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['pemphigus vulgaris', 'Nikolsky sign', 'desmoglein'],
  },
  // 13. Pediatrics (Morning)
  {
    paper: 'morning',
    subject: 'Pediatrics',
    topic: 'Pediatric Cardiology & Congenital Heart Disease',
    question:
      'A 14-month-old child with cyanosis since 4 months of age frequently squats after playing to relieve episodes of severe dyspnea and deepening cyanosis. Chest X-ray shows a boot-shaped heart ("coeur en sabot") with decreased pulmonary vascular markings. Which four defects comprise this condition?',
    options: [
      { key: 'A', text: 'VSD, overriding aorta, right ventricular hypertrophy, and pulmonary stenosis' },
      { key: 'B', text: 'ASD, VSD, PDA, and coarctation of aorta' },
      { key: 'C', text: 'VSD, overriding aorta, left ventricular hypertrophy, and aortic stenosis' },
      { key: 'D', text: 'Transposition of great arteries, ASD, PDA, and mitral stenosis' },
    ],
    correctKey: 'A',
    explanation: {
      whyCorrect:
        'Tetralogy of Fallot (TOF) is the most common cyanotic congenital heart disease beyond infancy. Its four components—driven by anterosuperior displacement of the infundibular septum—are pulmonary (RVOT) stenosis, VSD, overriding aorta, and right ventricular hypertrophy. Squatting raises systemic vascular resistance (SVR), decreasing right-to-left shunting across the VSD.',
      whyOthersWrong: {
        A: 'Correct option: PROVe — Pulmonary stenosis, RVH, Overriding aorta, VSD.',
        B: 'This is not a recognized single tetrad; coarctation is classically associated with Turner syndrome and rib notching.',
        C: 'TOF causes RIGHT ventricular hypertrophy due to pulmonary stenosis, not LVH or aortic stenosis.',
        D: 'TGA causes an "egg-on-a-string" silhouette on CXR with immediate severe neonatal cyanosis.',
      },
      questionConcept:
        'Pathophysiology, hemodynamics of "tet spells", and classic radiographic sign of Tetralogy of Fallot.',
      highYieldPoint:
        'Severity of cyanosis in TOF depends primarily on the degree of right ventricular outflow tract (pulmonary) stenosis; knee-chest positioning raises SVR to abort tet spells.',
      mnemonic: 'PROVe: Pulmonary stenosis, RVH, Overriding aorta, VSD.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2022,
    verified: true,
    tags: ['TOF', 'cyanotic CHD', 'boot-shaped heart', 'pediatrics'],
  },
  // 14. Psychiatry (Morning)
  {
    paper: 'morning',
    subject: 'Psychiatry',
    topic: 'Mood Disorders (Depression & Bipolar)',
    question:
      'A 32-year-old man with bipolar I disorder stabilized on lithium carbonate for 2 years presents with polyuria, polydipsia, coarse hand tremor, ataxia, and slurred speech after starting a thiazide diuretic for hypertension. Which renal adverse effect of lithium causes his polyuria?',
    options: [
      { key: 'A', text: 'Central diabetes insipidus' },
      { key: 'B', text: 'Nephrogenic diabetes insipidus' },
      { key: 'C', text: 'Syndrome of inappropriate ADH secretion (SIADH)' },
      { key: 'D', text: 'Minimal change nephropathy' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Lithium enters principal cells of the renal collecting duct via ENaC channels and downregulates aquaporin-2 expression, impairing ADH responsiveness and producing nephrogenic diabetes insipidus (polyuria/polydipsia). Thiazides, NSAIDs, and ACE inhibitors reduce lithium clearance, precipitating neurotoxicity (coarse tremor, ataxia, dysarthria).',
      whyOthersWrong: {
        A: 'Central DI results from deficient pituitary ADH release; lithium impairs renal collecting duct response to ADH instead.',
        B: 'Correct option: Lithium causes nephrogenic DI; amiloride is preferred for treatment because it blocks ENaC uptake of lithium.',
        C: 'SIADH causes euvolemic hyponatremia and concentrated urine, the opposite of polyuria/polydipsia (associated with SSRIs and carbamazepine).',
        D: 'Minimal change disease causes nephrotic syndrome (edema, heavy proteinuria), not polyuria with dilute urine.',
      },
      questionConcept:
        'Lithium toxicity precipitants (thiazides, NSAIDs, dehydration) and renal mechanism of lithium-induced polyuria.',
      highYieldPoint:
        'Fine tremor = therapeutic lithium side effect; Coarse tremor + ataxia + slurred speech = lithium TOXICITY (precipitated by thiazides/NSAIDs).',
      mnemonic: 'Lithium = LMNOP (Lithium side effects: Movement/tremor, Nephrogenic DI, hypOthyroidism, Pregnancy Ebstein anomaly).',
    },
    difficulty: 'medium',
    source: 'ai_generated',
    pyqYear: null,
    verified: false,
    tags: ['lithium', 'bipolar', 'nephrogenic DI', 'thiazide interaction'],
  },
  // 15. PSM (Community Medicine) (Morning)
  {
    paper: 'morning',
    subject: 'PSM (Community Medicine)',
    topic: 'Biostatistics & Screening Tests',
    question:
      'A new rapid diagnostic screening test for a disease is applied to two different communities: Community X has a disease prevalence of 30% while Community Y has a prevalence of 2%. Assuming test sensitivity and specificity remain unchanged, how does the Positive Predictive Value (PPV) behave?',
    options: [
      { key: 'A', text: 'PPV is higher in Community X than in Community Y' },
      { key: 'B', text: 'PPV is lower in Community X than in Community Y' },
      { key: 'C', text: 'PPV remains identical in both communities' },
      { key: 'D', text: 'Sensitivity decreases in Community Y while PPV stays constant' },
    ],
    correctKey: 'A',
    explanation: {
      whyCorrect:
        'Positive Predictive Value (PPV = TP / [TP + FP]) is directly proportional to disease prevalence. In a high-prevalence population (Community X, 30%), a positive test result is much more likely to be a true positive than in a low-prevalence population (Community Y, 2%). Sensitivity and specificity are intrinsic test properties independent of prevalence.',
      whyOthersWrong: {
        A: 'Correct option: Higher prevalence increases PPV and decreases NPV.',
        B: 'That describes Negative Predictive Value (NPV), which is inversely related to prevalence.',
        C: 'Only sensitivity, specificity, and likelihood ratios are independent of prevalence; predictive values always change with prevalence.',
        D: 'Sensitivity does not depend on prevalence, whereas PPV does.',
      },
      questionConcept:
        'Effect of disease prevalence on screening test metrics (sensitivity, specificity, PPV, NPV).',
      highYieldPoint:
        'Prevalence UP -> PPV UP, NPV DOWN. Sensitivity and specificity remain unchanged.',
      mnemonic: 'Prevalence and PPV move in Parallel (both start with P).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2024,
    verified: true,
    tags: ['biostatistics', 'PPV', 'prevalence', 'screening'],
  },
  // 16. PSM (Community Medicine) (Morning)
  {
    paper: 'morning',
    subject: 'PSM (Community Medicine)',
    topic: 'Nutrition, Environment & Biomedical Waste',
    question:
      'According to the Biomedical Waste Management Rules in India, into which color-coded container should used disposable plastic syringes (without needles) and IV tubing sets be discarded?',
    options: [
      { key: 'A', text: 'Yellow bag' },
      { key: 'B', text: 'Red bag' },
      { key: 'C', text: 'White translucent puncture-proof container' },
      { key: 'D', text: 'Blue cardboard box' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Under Indian Biomedical Waste Management Rules (2016, amended 2018), contaminated recyclable plastic waste—such as IV tubes, catheters, urine bags, vacutainers, and syringes without fixed needles—goes into the RED non-chlorinated plastic bag for autoclaving/shredding and recycling.',
      whyOthersWrong: {
        A: 'Yellow bag is for human/animal anatomical waste, soiled cotton/dressings, expired medicines, and cytotoxic drugs (incineration/deep burial).',
        B: 'Correct option: Red bag = contaminated recyclable plastics (tubing, catheters, syringes without needles).',
        C: 'White puncture-proof translucent container is strictly for metallic sharps (needles, scalpel blades, syringes with fixed needles).',
        D: 'Blue puncture-proof box is for glassware (broken/discarded vials, ampoules) and metallic body implants.',
      },
      questionConcept:
        'Four-color Biomedical Waste (BMW) segregation rules in Indian healthcare facilities.',
      highYieldPoint:
        'Yellow = anatomical/soiled/expired drugs; Red = recyclable plastics; White = metal sharps; Blue = glassware & metallic implants.',
      mnemonic: 'RED = Recyclable plastics; WHITE = metal sharps; BLUE = Broken glass.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['BMW', 'biomedical waste', 'Indian guidelines', 'PSM'],
  },
  // 17. Anaesthesia (Morning)
  {
    paper: 'morning',
    subject: 'Anaesthesia',
    topic: 'Neuromuscular Blockers & Local Anaesthetics',
    question:
      'Shortly after induction of general anaesthesia with halothane and succinylcholine, a 19-year-old boy develops severe masseter muscle rigidity, rapidly rising end-tidal CO2, tachycardia, and a core temperature of 40.2°C. What is the specific drug of choice for this emergency?',
    options: [
      { key: 'A', text: 'Neostigmine' },
      { key: 'B', text: 'Dantrolene sodium' },
      { key: 'C', text: 'Sugammadex' },
      { key: 'D', text: 'Bromocriptine' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Malignant hyperthermia is an autosomal dominant disorder of skeletal muscle ryanodine receptors (RYR1) triggered by volatile anaesthetics and succinylcholine. Uncontrolled calcium release from the sarcoplasmic reticulum causes hypermetabolism (rising ETCO2 is the earliest sensitive sign), rigidity, and hyperthermia. IV Dantrolene directly blocks RYR1 calcium release and is life-saving.',
      whyOthersWrong: {
        A: 'Neostigmine reverses non-depolarizing neuromuscular blockers (like vecuronium) and has no role in malignant hyperthermia.',
        B: 'Correct option: IV Dantrolene blocks RYR1 channels in skeletal muscle sarcoplasmic reticulum.',
        C: 'Sugammadex selectively encapsulates aminosteroid neuromuscular blockers (rocuronium, vecuronium).',
        D: 'Bromocriptine (dopamine agonist) is used in neuroleptic malignant syndrome (NMS), which develops over days after antipsychotics rather than acutely with anaesthetics.',
      },
      questionConcept:
        'Recognition and targeted pharmacology of malignant hyperthermia during general anaesthesia.',
      highYieldPoint:
        'Earliest sensitive sign of malignant hyperthermia = unexplained rise in End-Tidal CO2 (ETCO2); Drug of choice = IV Dantrolene.',
      mnemonic: 'Malignant Hyperthermia -> Dantrolene cools the RYR1 fire.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['malignant hyperthermia', 'dantrolene', 'succinylcholine', 'RYR1'],
  },
  // 18. Orthopedics (Morning)
  {
    paper: 'morning',
    subject: 'Orthopedics',
    topic: 'Upper & Lower Limb Fractures and Dislocations',
    question:
      'A 68-year-old postmenopausal woman falls on an outstretched hand and presents with a painful, deformed wrist showing a classic "dinner-fork" deformity. Which fracture is most likely present?',
    options: [
      { key: 'A', text: 'Smith fracture' },
      { key: 'B', text: 'Colles fracture' },
      { key: 'C', text: 'Monteggia fracture-dislocation' },
      { key: 'D', text: 'Galeazzi fracture-dislocation' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Colles fracture is an extra-articular fracture of the distal radius (within ~2 cm of the wrist joint) with dorsal angulation and dorsal displacement of the distal fragment, producing the classic "dinner-fork" (silver-fork) deformity after a fall on an outstretched hand (FOOSH) in osteoporotic women.',
      whyOthersWrong: {
        A: 'Smith fracture ("reverse Colles") has volar displacement of the distal radius fragment, causing a "garden-spade" deformity.',
        B: 'Correct option: Colles fracture = distal radius fracture with dorsal displacement ("dinner-fork" deformity).',
        C: 'Monteggia fracture is a proximal ulnar shaft fracture with radial head dislocation.',
        D: 'Galeazzi fracture is a distal radial shaft fracture with distal radioulnar joint (DRUJ) dislocation.',
      },
      questionConcept:
        'Eponymous forearm and distal radius fractures and their characteristic clinical deformities.',
      highYieldPoint:
        'Colles = Dorsal displacement = Dinner-fork; Smith = Volar displacement = Garden-spade; most common complication of Colles is finger stiffness (and malunion).',
      mnemonic: 'Colles = Dorsal Dinner-fork; MUGR (Monteggia Ulna, Galeazzi Radius).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2022,
    verified: true,
    tags: ['Colles fracture', 'FOOSH', 'dinner-fork', 'orthopedics'],
  },
  // 19. Medicine (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Medicine',
    topic: 'Cardiology & ECG Interpretation',
    question:
      'A 58-year-old man with chronic kidney disease stage 5 misses two hemodialysis sessions and arrives weak. His 12-lead ECG reveals tall, narrow, peaked T waves, prolonged PR interval, and a widening QRS complex. Serum potassium is 7.2 mEq/L. What is the immediate first medication to administer?',
    options: [
      { key: 'A', text: 'IV Calcium gluconate 10%' },
      { key: 'B', text: 'Oral sodium polystyrene sulfonate' },
      { key: 'C', text: 'IV Furosemide' },
      { key: 'D', text: 'IV Regular insulin with 50% dextrose' },
    ],
    correctKey: 'A',
    explanation: {
      whyCorrect:
        'When hyperkalemia produces ECG changes (peaked T waves, PR prolongation, loss of P waves, QRS widening/sine wave), the immediate life-saving priority is stabilizing the cardiac myocyte membrane threshold potential with IV 10% calcium gluconate. It acts within 1–3 minutes to prevent ventricular fibrillation or asystole, though it does not lower serum potassium.',
      whyOthersWrong: {
        A: 'Correct option: IV Calcium gluconate stabilizes the myocardium first; immediately follow with IV insulin + dextrose and nebulized salbutamol to shift K+ intracellularly.',
        B: 'Potassium-binding resins act slowly over hours and have no role as first-line therapy in ECG-manifest hyperkalemia.',
        C: 'Loop diuretics eliminate potassium slowly and are ineffective in anuric ESRD patients.',
        D: 'Insulin + dextrose rapidly shifts K+ into cells (onset 15–30 min), making it the second step right after myocardial membrane stabilization with calcium.',
      },
      questionConcept:
        'Stepwise emergency management of severe hyperkalemia with ECG toxicity.',
      highYieldPoint:
        'ECG changes in hyperkalemia -> Step 1: IV Calcium gluconate (stabilize heart); Step 2: Insulin + Dextrose / Salbutamol (shift K+); Step 3: Dialysis/diuretics/binders (remove K+).',
      mnemonic: 'C BIG K Drop: Calcium first, then Bicarb/Beta-agonist, Insulin+Glucose, Kayexalate/Dialysis.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2024,
    verified: true,
    tags: ['hyperkalemia', 'ECG', 'calcium gluconate', 'emergency'],
  },
  // 20. Medicine (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Medicine',
    topic: 'Neurology & Stroke Syndromes',
    question:
      'A 62-year-old hypertensive man develops sudden vertigo, hoarseness, dysphagia, ipsilateral Horner syndrome, ipsilateral loss of facial pain/temperature, and contralateral loss of pain/temperature over the trunk and limbs. Which artery is occluded?',
    options: [
      { key: 'A', text: 'Anterior spinal artery' },
      { key: 'B', text: 'Posterior inferior cerebellar artery (PICA)' },
      { key: 'C', text: 'Anterior inferior cerebellar artery (AICA)' },
      { key: 'D', text: 'Middle cerebral artery (MCA)' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'This clinical constellation is Wallenberg (lateral medullary) syndrome, caused by occlusion of the vertebral artery or Posterior Inferior Cerebellar Artery (PICA). Dysphagia and hoarseness are specific to nucleus ambiguus involvement in the lateral medulla, alongside ipsilateral Horner syndrome, crossed pain/temperature loss, and vestibular ataxia.',
      whyOthersWrong: {
        A: 'Anterior spinal artery occlusion causes medial medullary (Dejerine) syndrome: ipsilateral tongue deviation (CN XII) and contralateral hemiparesis/vibration loss.',
        B: 'Correct option: PICA occlusion causes lateral medullary (Wallenberg) syndrome with hallmark dysphagia/hoarseness (nucleus ambiguus).',
        C: 'AICA occlusion causes lateral pontine syndrome featuring ipsilateral facial paralysis (CN VII) and sensorineural deafness (CN VIII) rather than dysphagia.',
        D: 'MCA occlusion causes contralateral hemiparesis/hemisensory loss (face and arm > leg) and aphasia or neglect.',
      },
      questionConcept:
        'Brainstem stroke localization—differentiating lateral medullary (PICA), lateral pontine (AICA), and medial medullary syndromes.',
      highYieldPoint:
        'Dysphagia + hoarseness (Nucleus ambiguus) + ipsilateral Horner + crossed pain/temp loss = Wallenberg lateral medullary syndrome (PICA).',
      mnemonic: 'Don’t PIC a horse (PICA = Hoarseness & dysphagia from Nucleus Ambiguus).',
    },
    difficulty: 'medium',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['Wallenberg', 'PICA', 'brainstem stroke', 'neurology'],
  },
  // 21. Medicine (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Medicine',
    topic: 'Endocrinology & Diabetes',
    question:
      'A 24-year-old woman presents with weight loss, heat intolerance, palpitations, diffuse non-tender thyroid enlargement with a systolic bruit, and bilateral exophthalmos. Laboratory testing shows TSH < 0.01 mIU/L and elevated free T4. Which antibody is directly responsible for her hyperthyroidism?',
    options: [
      { key: 'A', text: 'Anti-thyroid peroxidase (anti-TPO) antibody' },
      { key: 'B', text: 'Thyroid-stimulating hormone receptor antibody (TRAb / TSI)' },
      { key: 'C', text: 'Anti-thyroglobulin antibody' },
      { key: 'D', text: 'Anti-21-hydroxylase antibody' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Graves disease is a Type II hypersensitivity disorder mediated by IgG autoantibodies (TRAb / Thyroid-Stimulating Immunoglobulins) that bind and constitutively activate TSH receptors on thyroid follicular cells, driving diffuse goiter, increased vascularity (bruit), and excess thyroid hormone synthesis.',
      whyOthersWrong: {
        A: 'Anti-TPO antibodies are characteristically elevated in Hashimoto thyroiditis (the most common cause of hypothyroidism in iodine-sufficient regions).',
        B: 'Correct option: TSH receptor stimulating antibodies (TRAb/TSI) cause Graves hyperthyroidism and also stimulate orbital fibroblasts.',
        C: 'Anti-thyroglobulin antibodies are seen in Hashimoto thyroiditis and interfere with thyroglobulin tumor marker monitoring in thyroid cancer.',
        D: 'Anti-21-hydroxylase antibodies are diagnostic of autoimmune primary adrenal insufficiency (Addison disease).',
      },
      questionConcept:
        'Pathogenesis and specific autoantibody markers of autoimmune thyroid disease.',
      highYieldPoint:
        'Graves ophthalmopathy + pretibial myxedema + thyroid bruit are pathognomonic of Graves disease (TRAb/TSI mediated).',
      mnemonic: 'Graves = Stimulating TRAb (Type II hypersensitivity).',
    },
    difficulty: 'easy',
    source: 'ai_generated',
    pyqYear: null,
    verified: false,
    tags: ['Graves disease', 'hyperthyroidism', 'TRAb', 'endocrinology'],
  },
  // 22. General Surgery (Afternoon)
  {
    paper: 'afternoon',
    subject: 'General Surgery',
    topic: 'Hepatobiliary, Pancreas & Spleen',
    question:
      'A 55-year-old woman with known gallstones presents to the emergency room with right upper quadrant pain, high-grade fever with chills (39.4°C), jaundice, confusion, and blood pressure of 82/50 mmHg. What is this clinical pentad called, and what is the definitive urgent intervention after resuscitation and IV antibiotics?',
    options: [
      { key: 'A', text: 'Charcot triad; elective laparoscopic cholecystectomy in 6 weeks' },
      { key: 'B', text: 'Reynolds pentad; urgent biliary decompression via ERCP' },
      { key: 'C', text: 'Courvoisier sign; Whipple pancreaticoduodenectomy' },
      { key: 'D', text: 'Boas sign; conservative management with oral ursodeoxycholic acid' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Charcot triad (RUQ pain, fever, jaundice) plus hypotension (shock) and altered mental status constitutes Reynolds pentad, diagnostic of severe acute ascending cholangitis. After aggressive IV fluid resuscitation and broad-spectrum antibiotics, urgent biliary decompression—most commonly via ERCP with sphincterotomy/stenting—is mandatory.',
      whyOthersWrong: {
        A: 'Charcot triad comprises only 3 features (pain, fever, jaundice); adding shock and confusion completes Reynolds pentad, which requires urgent decompression, not delayed surgery.',
        B: 'Correct option: Reynolds pentad indicates severe suppurative cholangitis needing urgent ERCP biliary drainage.',
        C: 'Courvoisier law states a palpable, non-tender gallbladder with painless jaundice suggests malignancy (e.g., periampullary/pancreatic head cancer) rather than stones.',
        D: 'Boas sign is hyperesthesia below the right scapula in acute cholecystitis, not septic cholangitis.',
      },
      questionConcept:
        'Clinical recognition and Tokyo Guidelines emergency management of acute ascending cholangitis.',
      highYieldPoint:
        'Reynolds Pentad = Charcot Triad (Fever, RUQ pain, Jaundice) + Shock + Altered Mental Status -> Urgent ERCP drainage.',
      mnemonic: 'Reynolds = Charcot + Shock + Sensorium.',
    },
    difficulty: 'medium',
    source: 'pyq',
    pyqYear: 2024,
    verified: true,
    tags: ['cholangitis', 'Reynolds pentad', 'ERCP', 'surgery'],
  },
  // 23. General Surgery (Afternoon)
  {
    paper: 'afternoon',
    subject: 'General Surgery',
    topic: 'Trauma, Shock, Burns & Fluid Management',
    question:
      'A 70 kg adult male sustains partial- and full-thickness thermal burns over his entire anterior trunk, entire right upper limb, and entire anterior right lower limb. Using the Wallace Rule of Nines and the Parkland formula (4 mL/kg/%TBSA), how much Ringer lactate should be infused in the FIRST 8 hours from the time of burn?',
    options: [
      { key: 'A', text: '5,040 mL' },
      { key: 'B', text: '10,080 mL' },
      { key: 'C', text: '3,780 mL' },
      { key: 'D', text: '7,560 mL' },
    ],
    correctKey: 'A',
    explanation: {
      whyCorrect:
        'By the Wallace Rule of Nines: anterior trunk = 18%, entire right upper limb = 9%, anterior right lower limb = 9%; total TBSA = 36%. Parkland 24-hour total = 4 mL × 70 kg × 36 = 10,080 mL. Half of this volume (5,040 mL) is infused in the FIRST 8 hours calculated from the time of injury, and the remaining half over the next 16 hours.',
      whyOthersWrong: {
        A: 'Correct option: 10,080 mL / 2 = 5,040 mL in the first 8 hours.',
        B: '10,080 mL is the total 24-hour fluid volume, not the first 8-hour allotment.',
        C: '3,780 mL results from calculating 27% TBSA (forgetting one 9% region).',
        D: '7,560 mL does not match the 50% first-8-hour split of the Parkland formula.',
      },
      questionConcept:
        'Calculation of burn surface area (Wallace Rule of Nines) and Parkland resuscitation formula timing.',
      highYieldPoint:
        'Parkland formula = 4 mL × weight (kg) × %TBSA of Ringer Lactate: give HALF in the first 8 hours FROM TIME OF BURN, titrating to urine output 0.5 mL/kg/hr in adults.',
      mnemonic: 'Rule of 9s: Head 9, Each Arm 9, Front Trunk 18, Back Trunk 18, Each Leg 18, Perineum 1.',
    },
    difficulty: 'medium',
    source: 'ai_generated',
    pyqYear: null,
    verified: false,
    tags: ['burns', 'Parkland formula', 'Rule of Nines', 'trauma'],
  },
  // 24. Obstetrics & Gynaecology (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Obstetrics & Gynaecology',
    topic: 'Hypertensive Disorders, GDM & Medical Disorders',
    question:
      'A 26-year-old primigravida at 35 weeks gestation is brought with generalized tonic-clonic seizures, BP 172/114 mmHg, and 3+ proteinuria. Which drug is the agent of choice to control and prevent further eclamptic seizures?',
    options: [
      { key: 'A', text: 'IV Phenytoin' },
      { key: 'B', text: 'IV Diazepam' },
      { key: 'C', text: 'Magnesium sulfate (Pritchard or Zuspan regimen)' },
      { key: 'D', text: 'IV Levetiracetam' },
    ],
    correctKey: 'C',
    explanation: {
      whyCorrect:
        'Magnesium sulfate (MgSO4) is universally the drug of choice for both prevention and treatment of eclampsia (proven superior in the Magpie and Eclampsia Collaborative Trials). In India, the Pritchard regimen (4 g IV loading + 10 g IM loading, followed by 5 g IM every 4 hours) is widely tested. Always monitor patellar reflexes, respiratory rate (≥16/min), and urine output (≥30 mL/hr).',
      whyOthersWrong: {
        A: 'Phenytoin is inferior to MgSO4 for preventing recurrent eclamptic seizures.',
        B: 'Diazepam causes significant neonatal respiratory depression and hypotonia and has higher recurrent seizure rates than MgSO4.',
        C: 'Correct option: Magnesium sulfate is the DOC for eclampsia; Calcium gluconate 10% (10 mL IV) is its antidote for toxicity.',
        D: 'Levetiracetam is used in epilepsy during pregnancy, not as first-line therapy for eclampsia.',
      },
      questionConcept:
        'First-line anticonvulsant management and toxicity monitoring in eclampsia.',
      highYieldPoint:
        'First clinical sign of MgSO4 toxicity = loss of deep tendon (patellar) reflex; Antidote = 10 mL of 10% IV Calcium gluconate.',
      mnemonic: 'Pritchard: 4 IV + 10 IM load, 5 IM q4h; Monitor RRU (Reflex, Resp rate, Urine output).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2024,
    verified: true,
    tags: ['eclampsia', 'MgSO4', 'Pritchard regimen', 'OBG'],
  },
  // 25. Obstetrics & Gynaecology (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Obstetrics & Gynaecology',
    topic: 'Antepartum & Postpartum Hemorrhage',
    question:
      'A 30-year-old multigravida at 34 weeks gestation presents with sudden, painless, bright-red vaginal bleeding. On abdominal exam, the uterus is soft, non-tender, and the fetal head is high and floating with normal fetal heart sounds. What is the single most important examination to AVOID?',
    options: [
      { key: 'A', text: 'Transabdominal ultrasonography' },
      { key: 'B', text: 'Per vaginal (digital) examination' },
      { key: 'C', text: 'Cardiotocography (NST)' },
      { key: 'D', text: 'Blood grouping and cross-matching' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Painless, causeless, recurrent bright-red bleeding in the third trimester with a soft, non-tender uterus and unengaged presenting part is classic for placenta previa. A digital per vaginal (PV) examination is strictly contraindicated until placenta previa is excluded by ultrasound, as it can tear the low-lying placenta and trigger catastrophic hemorrhage.',
      whyOthersWrong: {
        A: 'Transabdominal (and gentle transvaginal) ultrasound is the investigation of choice to confirm placental localization.',
        B: 'Correct option: Never perform a digital PV exam in antepartum hemorrhage until placenta previa is ruled out by USG.',
        C: 'Cardiotocography safely monitors fetal well-being.',
        D: 'Cross-matching blood and establishing two wide-bore IV lines are essential resuscitation steps.',
      },
      questionConcept:
        'Clinical distinction between placenta previa and abruptio placentae, and safe initial workup of antepartum hemorrhage.',
      highYieldPoint:
        'Placenta previa = Painless bright-red bleeding + soft uterus -> NO PV exam; Abruptio placentae = Painful dark bleeding + tense tender woody uterus.',
      mnemonic: 'Previa = Painless -> Prohibit PV exam.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['placenta previa', 'APH', 'OBG', 'contraindication'],
  },
  // 26. Radiology (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Radiology',
    topic: 'Abdominal, GI & Hepatobiliary Radiology',
    question:
      'A 66-year-old man with chronic constipation presents with acute abdominal distension and obstipation. A plain supine abdominal radiograph shows a massively dilated, inverted U-shaped bowel loop arising from the pelvis and pointing toward the right upper quadrant, creating a classic "coffee-bean sign." What is the diagnosis?',
    options: [
      { key: 'A', text: 'Cecal volvulus' },
      { key: 'B', text: 'Sigmoid volvulus' },
      { key: 'C', text: 'Intussusception' },
      { key: 'D', text: 'Small bowel obstruction' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Sigmoid volvulus produces a closed-loop obstruction with a hugely distended, ahaustral inverted U-shaped loop rising out of the pelvis toward the right upper quadrant—classically termed the "coffee-bean" or "omega" sign. On contrast enema, it shows a "bird-beak" taper.',
      whyOthersWrong: {
        A: 'Cecal volvulus typically appears as a kidney-shaped dilated loop in the LEFT upper quadrant with preserved haustra.',
        B: 'Correct option: Sigmoid volvulus = coffee-bean sign pointing to RUQ; initial treatment (if no gangrene/perforation) is endoscopic sigmoidoscopic detorsion.',
        C: 'Intussusception shows a "target" or "doughnut" sign on ultrasound and "claw" sign on barium enema.',
        D: 'Small bowel obstruction shows centrally placed dilated loops with valvulae conniventes and step-ladder air-fluid levels on erect films.',
      },
      questionConcept:
        'Classic abdominal X-ray signs in acute intestinal obstruction.',
      highYieldPoint:
        'Sigmoid volvulus: Coffee-bean / Omega sign on X-ray + Bird-beak sign on barium enema; Cecal volvulus points to LUQ.',
      mnemonic: 'Sigmoid goes to the Right upper quadrant (Coffee bean); Cecum goes to the Left.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['coffee-bean sign', 'sigmoid volvulus', 'radiology'],
  },
  // 27. Ophthalmology (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Ophthalmology',
    topic: 'Glaucoma & Corneal Disorders',
    question:
      'A 62-year-old hypermetropic woman develops sudden severe unilateral eye pain, headache, nausea, halos around lights, and blurred vision while sitting in a dark cinema hall. Examination reveals a stony hard globe, hazy cornea, shallow anterior chamber, and a mid-dilated vertically oval non-reactive pupil. Which drug is CONTRAINDICATED?',
    options: [
      { key: 'A', text: 'IV Mannitol' },
      { key: 'B', text: 'IV Acetazolamide' },
      { key: 'C', text: 'Topical Pilocarpine' },
      { key: 'D', text: 'Topical Atropine' },
    ],
    correctKey: 'D',
    explanation: {
      whyCorrect:
        'The patient has acute primary angle-closure glaucoma (PACG) triggered by physiological mydriasis in the dark. Topical Atropine is a potent mydriatic/cycloplegic that further dilates the pupil, crowding the iridocorneal angle and worsening pupillary block—making it strictly contraindicated.',
      whyOthersWrong: {
        A: 'IV Mannitol (hyperosmotic) rapidly shrinks vitreous volume to acutely lower IOP.',
        B: 'IV Acetazolamide (carbonic anhydrase inhibitor) rapidly decreases aqueous humor production.',
        C: 'Topical Pilocarpine (miotic) constricts the pupil once IOP begins falling, pulling the peripheral iris away from the trabecular meshwork; definitive treatment is Nd:YAG laser peripheral iridotomy.',
        D: 'Correct option: Atropine causes mydriasis and precipitously worsens angle-closure glaucoma.',
      },
      questionConcept:
        'Emergency presentation and pharmacological management of acute angle-closure glaucoma.',
      highYieldPoint:
        'Acute Angle-Closure Glaucoma: Lower IOP with IV Mannitol + Acetazolamide + Timolol + Pilocarpine; Definitive treatment = Bilateral Nd:YAG Laser Peripheral Iridotomy; NEVER give Atropine.',
      mnemonic: 'Atropine opens the Pupil and Closes the Angle (Avoid!).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2024,
    verified: true,
    tags: ['glaucoma', 'PACG', 'atropine', 'ophthalmology'],
  },
  // 28. ENT (Afternoon)
  {
    paper: 'afternoon',
    subject: 'ENT',
    topic: 'Otology (CSOM, Otosclerosis, Meniere, Audiometry)',
    question:
      'A 32-year-old woman presents with progressive bilateral conductive hearing loss that worsened during her second pregnancy. She reports hearing speech better in noisy environments (paracusis Willisii). Otoscopy is normal except for a faint pinkish blush over the promontory (Schwartze sign). Pure tone audiometry shows a dip in bone conduction at 2,000 Hz. What is the diagnosis?',
    options: [
      { key: 'A', text: 'Meniere disease' },
      { key: 'B', text: 'Otosclerosis' },
      { key: 'C', text: 'Acoustic neuroma' },
      { key: 'D', text: 'Noise-induced hearing loss' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Otosclerosis (otospongiosis) causes stapes footplate fixation at the oval window, presenting in young women with progressive conductive hearing loss exacerbated by pregnancy, paracusis Willisii, Schwartze (flamingo-pink) sign during active spongiosis, and the characteristic Carhart notch (dip in bone conduction at 2,000 Hz).',
      whyOthersWrong: {
        A: 'Meniere disease causes episodic vertigo, tinnitus, aural fullness, and fluctuating low-frequency SENSORINEURAL hearing loss.',
        B: 'Correct option: Otosclerosis = Carhart notch at 2 kHz + Schwartze sign + Paracusis Willisii; treatment of choice is Stapedotomy with Teflon piston.',
        C: 'Acoustic neuroma (vestibular schwannoma) causes unilateral asymmetric sensorineural hearing loss, poor speech discrimination, and absent corneal reflex.',
        D: 'Noise-induced hearing loss produces a bilateral sensorineural dip at 4,000 Hz (Boilers notch).',
      },
      questionConcept:
        'Clinical triad, audiometric notches (2 kHz vs 4 kHz), and surgical management of otosclerosis.',
      highYieldPoint:
        'Carhart notch = 2,000 Hz bone-conduction dip in Otosclerosis (disappears after successful stapedotomy); Boiler/acoustic dip = 4,000 Hz in noise-induced hearing loss.',
      mnemonic: 'Carhart 2k = Conductive Otosclerosis; Noise 4k = Sensorineural.',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2023,
    verified: true,
    tags: ['otosclerosis', 'Carhart notch', 'Schwartze sign', 'ENT'],
  },
  // 29. Forensic Medicine (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Forensic Medicine',
    topic: 'Forensic Toxicology (Corrosives, Heavy Metals, Organophosphates)',
    question:
      'A 38-year-old battery-factory worker presents with abdominal colic, wrist drop, microcytic anemia with basophilic stippling of erythrocytes, and a bluish-black line along the gingival margin. Which poisoning is this, and what is the gingival sign called?',
    options: [
      { key: 'A', text: 'Arsenic poisoning; Mees lines' },
      { key: 'B', text: 'Lead poisoning; Burtonian line' },
      { key: 'C', text: 'Mercury poisoning; Hatter shakes' },
      { key: 'D', text: 'Copper poisoning; Kayser-Fleischer ring' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Chronic lead poisoning (plumbism) presents with Burtonian (blue-black) gum line due to lead sulfide deposition near carious teeth, colicky abdominal pain ("lead colic"), motor peripheral neuropathy (wrist drop/foot drop), and inhibition of ALA dehydratase and ferrochelatase causing basophilic stippling and ringed sideroblasts.',
      whyOthersWrong: {
        A: 'Chronic arsenic poisoning causes Mees lines (transverse white nail bands), raindrop pigmentation, and Aldrich-Mees hyperkeratosis.',
        B: 'Correct option: Lead poisoning produces Burtonian line, wrist drop, basophilic stippling, and radiodense metaphyseal lead lines in children.',
        C: 'Chronic mercury poisoning causes erethism (neuropsychiatric changes), intention tremor ("hatter shakes"), and mercuria lentis.',
        D: 'Kayser-Fleischer ring is copper deposition in Descemet membrane of the cornea in Wilson disease, not a gingival sign.',
      },
      questionConcept:
        'Classic toxicological manifestations and eponymous physical signs of heavy metal poisoning.',
      highYieldPoint:
        'Lead poisoning (Plumbism): Burtonian gum line + Basophilic stippling + Wrist drop + Lead colic; Chelators = BAL + CaNa2-EDTA (severe) or Succimer/DMSA (mild-moderate).',
      mnemonic: 'LEAD: Lines (Burtonian/metaphyseal), Encephalopathy/Erythrocyte stippling, Abdominal colic, Drops (wrist/foot).',
    },
    difficulty: 'easy',
    source: 'pyq',
    pyqYear: 2022,
    verified: true,
    tags: ['lead poisoning', 'Burtonian line', 'toxicology', 'FMT'],
  },
  // 30. Medicine (Afternoon)
  {
    paper: 'afternoon',
    subject: 'Medicine',
    topic: 'Infectious Diseases & Hematology',
    question:
      'According to current Indian NVBDCP guidelines, what is the first-line treatment for an uncomplicated Plasmodium falciparum malaria infection in a non-pregnant adult residing in Maharashtra (non-North-Eastern state)?',
    options: [
      { key: 'A', text: 'Chloroquine for 3 days + Primaquine for 14 days' },
      { key: 'B', text: 'Artesunate + Sulfadoxine-Pyrimethamine (ACT-SP) for 3 days + single-dose Primaquine on Day 2' },
      { key: 'C', text: 'Artemether + Lumefantrine (ACT-AL) for 3 days only' },
      { key: 'D', text: 'Oral Quinine + Doxycycline for 7 days' },
    ],
    correctKey: 'B',
    explanation: {
      whyCorrect:
        'Under India’s National Vector Borne Disease Control Programme (NVBDCP/NCVBDC), uncomplicated P. falciparum malaria outside the North-Eastern states is treated with ACT-SP (Artesunate for 3 days + Sulfadoxine-Pyrimethamine on Day 1) PLUS a single gametocytocidal dose of Primaquine (0.75 mg/kg) on Day 2 to interrupt transmission.',
      whyOthersWrong: {
        A: 'Chloroquine (3 days) + Primaquine (14 days) is the Indian regimen for P. vivax malaria, not P. falciparum.',
        B: 'Correct option: ACT-SP + single-dose Primaquine on Day 2 is first-line across India EXCEPT the 7 North-Eastern states (where SP resistance requires Artemether-Lumefantrine).',
        C: 'ACT-AL (Artemether-Lumefantrine) + single-dose Primaquine on Day 2 is specifically recommended for the North-Eastern states of India.',
        D: 'Oral Quinine is reserved for P. falciparum malaria in the FIRST trimester of pregnancy (or IV Artesunate for severe malaria in all trimesters).',
      },
      questionConcept:
        'Current Indian NVBDCP antimalarial guidelines differentiating P. vivax vs P. falciparum and NE vs non-NE states.',
      highYieldPoint:
        'India P. falciparum: Non-NE states = ACT-SP + Day 2 Primaquine; NE states = ACT-AL + Day 2 Primaquine; Severe malaria (including pregnancy) = IV Artesunate.',
      mnemonic: 'NE states get AL (Artemether-Lumefantrine); rest of India gets SP.',
    },
    difficulty: 'hard',
    source: 'ai_generated',
    pyqYear: null,
    verified: false,
    tags: ['malaria', 'NVBDCP', 'Indian guidelines', 'ACT-SP'],
  },
];
