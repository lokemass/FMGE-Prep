export type PaperType = 'morning' | 'afternoon';

export interface SubjectDefinition {
  name: string;
  paper: PaperType;
  shortName: string;
  /** Approximate FMGE exam weight out of 150 questions in its paper */
  examWeight: number;
  /** Target counts per topic for bulk seeding (totals 10,000+ across 19 subjects) */
  topics: Record<string, number>;
}

export const EXAM_STRUCTURE: SubjectDefinition[] = [
  // ================= MORNING PAPER (12 Subjects, 150 MCQs, 3 Hours) =================
  {
    name: 'Anatomy',
    paper: 'morning',
    shortName: 'Anatomy',
    examWeight: 17,
    topics: {
      'Upper Limb & Brachial Plexus': 110,
      'Lower Limb & Gait': 95,
      'Head, Neck & Cranial Nerves': 140,
      'Neuroanatomy & Brainstem': 125,
      'Thorax & Heart': 80,
      'Abdomen & Pelvis': 110,
      'Embryology & Pharyngeal Arches': 100,
      'Histology & General Anatomy': 60,
    },
  },
  {
    name: 'Physiology',
    paper: 'morning',
    shortName: 'Physiology',
    examWeight: 17,
    topics: {
      'General & Nerve-Muscle Physiology': 100,
      'Cardiovascular Physiology & ECG': 130,
      'Respiratory Physiology': 115,
      'Renal & Acid-Base Physiology': 120,
      'Endocrine & Reproductive Physiology': 115,
      'Neurophysiology & Special Senses': 110,
      'Gastrointestinal & Blood Physiology': 90,
    },
  },
  {
    name: 'Biochemistry',
    paper: 'morning',
    shortName: 'Biochem',
    examWeight: 17,
    topics: {
      'Carbohydrate Metabolism & Inborn Errors': 110,
      'Lipid Metabolism & Lipoproteins': 95,
      'Amino Acid Metabolism & Urea Cycle': 110,
      'Vitamins & Minerals': 120,
      'Enzymes & Bioenergetics': 85,
      'Molecular Biology & Genetics': 130,
    },
  },
  {
    name: 'Pathology',
    paper: 'morning',
    shortName: 'Pathology',
    examWeight: 13,
    topics: {
      'Cell Injury, Necrosis & Apoptosis': 95,
      'Inflammation, Repair & Amyloidosis': 100,
      'Neoplasia & Tumor Markers': 120,
      'Immunopathology & Hypersensitivity': 100,
      'Hematology & Coagulation Disorders': 150,
      'Systemic Pathology (CVS, Resp, Renal, GI)': 165,
      'Endocrine & CNS Pathology': 90,
    },
  },
  {
    name: 'Microbiology',
    paper: 'morning',
    shortName: 'Micro',
    examWeight: 13,
    topics: {
      'General Microbiology & Sterilization': 90,
      'Immunology & Vaccines': 95,
      'Gram-Positive & Gram-Negative Bacteria': 160,
      'Mycobacteria & Spirochetes': 100,
      'Virology (HIV, Hepatitis, Arboviruses)': 150,
      'Parasitology (Malaria, Leishmania, Helminths)': 125,
      'Mycology & Clinical Microbiology': 80,
    },
  },
  {
    name: 'Pharmacology',
    paper: 'morning',
    shortName: 'Pharma',
    examWeight: 13,
    topics: {
      'General Pharmacology & Pharmacokinetics': 95,
      'Autonomic Nervous System Drugs': 115,
      'Cardiovascular & Renal Drugs': 130,
      'Central Nervous System & Psychopharmacology': 120,
      'Antimicrobials, ATT & Antiretrovirals': 170,
      'Endocrine, Autacoids & Chemotherapy': 130,
      'Toxicology & Antidotes': 60,
    },
  },
  {
    name: 'Dermatology',
    paper: 'morning',
    shortName: 'Derma',
    examWeight: 5,
    topics: {
      'Vesiculobullous & Papulosquamous Disorders': 75,
      'Infective Dermatoses (Leprosy, Fungal, STI)': 95,
      'Pigmentary, Hair & Nail Disorders': 60,
      'Eczema, Drug Reactions & Genodermatoses': 60,
    },
  },
  {
    name: 'Pediatrics',
    paper: 'morning',
    shortName: 'Peds',
    examWeight: 15,
    topics: {
      'Neonatology & NRP Guidelines': 130,
      'Growth, Development & Milestones': 105,
      'Nutrition, SAM & Immunization': 105,
      'Pediatric Cardiology & Congenital Heart Disease': 90,
      'Pediatric Respiratory, GI & Nephrology': 100,
      'Pediatric Neurology & Genetics': 70,
    },
  },
  {
    name: 'Psychiatry',
    paper: 'morning',
    shortName: 'Psych',
    examWeight: 5,
    topics: {
      'Schizophrenia & Psychotic Disorders': 70,
      'Mood Disorders (Depression & Bipolar)': 75,
      'Anxiety, OCD & Trauma Disorders': 60,
      'Substance Use & Organic Psychiatry': 65,
      'Child Psychiatry & Mental Healthcare Act': 50,
    },
  },
  {
    name: 'PSM (Community Medicine)',
    paper: 'morning',
    shortName: 'PSM',
    examWeight: 25,
    topics: {
      'Epidemiology & Study Designs': 155,
      'Biostatistics & Screening Tests': 135,
      'National Health Programs (NTEP, NVBDCP, NACP)': 170,
      'Immunization, Cold Chain & Vaccines': 115,
      'Demography, Family Planning & MCH': 115,
      'Nutrition, Environment & Biomedical Waste': 110,
      'Occupational Health & Health Planning': 80,
    },
  },
  {
    name: 'Anaesthesia',
    paper: 'morning',
    shortName: 'Anaesthesia',
    examWeight: 5,
    topics: {
      'Inhalational & Intravenous Anaesthetics': 75,
      'Neuromuscular Blockers & Local Anaesthetics': 75,
      'Airway Management, Circuits & Monitoring': 65,
      'Regional Anaesthesia & CPR (ACLS/BLS)': 65,
    },
  },
  {
    name: 'Orthopedics',
    paper: 'morning',
    shortName: 'Ortho',
    examWeight: 5,
    topics: {
      'Upper & Lower Limb Fractures and Dislocations': 100,
      'Peripheral Nerve Injuries & Pediatric Orthopedics': 75,
      'Bone Tumors & Metabolic Bone Disease': 75,
      'Bone Infections (Osteomyelitis, Pott Spine)': 60,
    },
  },

  // ================= AFTERNOON PAPER (7 Subjects, 150 MCQs, 3 Hours) =================
  {
    name: 'Medicine',
    paper: 'afternoon',
    shortName: 'Medicine',
    examWeight: 33,
    topics: {
      'Cardiology & ECG Interpretation': 160,
      'Pulmonology & Critical Care': 130,
      'Neurology & Stroke Syndromes': 155,
      'Endocrinology & Diabetes': 140,
      'Gastroenterology & Hepatology': 135,
      'Nephrology & Electrolyte Imbalance': 130,
      'Rheumatology & Connective Tissue Diseases': 100,
      'Infectious Diseases & Hematology': 130,
    },
  },
  {
    name: 'General Surgery',
    paper: 'afternoon',
    shortName: 'Surgery',
    examWeight: 32,
    topics: {
      'Trauma, Shock, Burns & Fluid Management': 145,
      'Hepatobiliary, Pancreas & Spleen': 145,
      'GI Surgery (Esophagus, Stomach, Bowel, Hernias)': 165,
      'Breast, Thyroid & Parathyroid': 140,
      'Urology & Renal Calculi': 120,
      'Vascular, Cardiothoracic & Neurosurgery': 115,
      'Wound Healing, Sutures & Surgical Oncology': 90,
    },
  },
  {
    name: 'Obstetrics & Gynaecology',
    paper: 'afternoon',
    shortName: 'OBG',
    examWeight: 30,
    topics: {
      'Normal Pregnancy, Pelvis & Labor Management': 145,
      'Hypertensive Disorders, GDM & Medical Disorders': 135,
      'Antepartum & Postpartum Hemorrhage': 130,
      'Contraception, MTP Act & Infertility': 115,
      'Menstrual Disorders, PCOS & Endometriosis': 120,
      'Gynecologic Oncology (Cervix, Endometrium, Ovary)': 135,
      'Pelvic Infections, Prolapse & Urogynecology': 90,
    },
  },
  {
    name: 'Radiology',
    paper: 'afternoon',
    shortName: 'Radiology',
    examWeight: 10,
    topics: {
      'Chest & Cardiovascular Imaging': 90,
      'Abdominal, GI & Hepatobiliary Radiology': 85,
      'Neuroradiology & MSK Signs': 90,
      'Radiation Physics, Contrast & Radiotherapy': 75,
    },
  },
  {
    name: 'Ophthalmology',
    paper: 'afternoon',
    shortName: 'Ophthal',
    examWeight: 15,
    topics: {
      'Lens, Cataract & Refractive Errors': 105,
      'Glaucoma & Corneal Disorders': 115,
      'Retina, Uvea & Optic Nerve': 125,
      'Strabismus, Orbit, Conjunctiva & Community Ophthal': 95,
    },
  },
  {
    name: 'ENT',
    paper: 'afternoon',
    shortName: 'ENT',
    examWeight: 15,
    topics: {
      'Otology (CSOM, Otosclerosis, Meniere, Audiometry)': 140,
      'Rhinology (Sinusitis, Nasal Polyps, Epistaxis)': 105,
      'Pharynx, Larynx & Neck Masses': 125,
      'Salivary Glands & Head-Neck Oncology': 70,
    },
  },
  {
    name: 'Forensic Medicine',
    paper: 'afternoon',
    shortName: 'FMT',
    examWeight: 15,
    topics: {
      'Medical Jurisprudence, IPC/BNS & Courts': 95,
      'Thanatology & Postmortem Changes': 90,
      'Mechanical Injuries, Firearms & Asphyxia': 115,
      'Forensic Toxicology (Corrosives, Heavy Metals, Organophosphates)': 125,
      'Sexual Offences, Identification & Forensic Psychiatry': 75,
    },
  },
];

export const MORNING_SUBJECTS = EXAM_STRUCTURE.filter((s) => s.paper === 'morning').map((s) => s.name);
export const AFTERNOON_SUBJECTS = EXAM_STRUCTURE.filter((s) => s.paper === 'afternoon').map((s) => s.name);
export const ALL_SUBJECT_NAMES = EXAM_STRUCTURE.map((s) => s.name);

export const SUBJECT_MAP = new Map<string, SubjectDefinition>(
  EXAM_STRUCTURE.map((s) => [s.name, s])
);

export function getPaperForSubject(subject: string): PaperType | null {
  return SUBJECT_MAP.get(subject)?.paper ?? null;
}

export const TOTAL_SEED_TARGET = EXAM_STRUCTURE.reduce(
  (sum, subj) => sum + Object.values(subj.topics).reduce((a, b) => a + b, 0),
  0
);
