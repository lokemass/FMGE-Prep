// Shared FMGE 19-subject configuration for seeding scripts (totals 11,960 MCQs > 10,000 target)
// Weighted toward high-yield FMGE subjects: Medicine, General Surgery, OBG, PSM, Pathology, Pharmacology, Anatomy, Physiology, Microbiology.

export const SEED_SUBJECT_CONFIG = [
  // Morning Paper (12 subjects)
  {
    paper: 'morning',
    subject: 'Anatomy',
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
    paper: 'morning',
    subject: 'Physiology',
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
    paper: 'morning',
    subject: 'Biochemistry',
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
    paper: 'morning',
    subject: 'Pathology',
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
    paper: 'morning',
    subject: 'Microbiology',
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
    paper: 'morning',
    subject: 'Pharmacology',
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
    paper: 'morning',
    subject: 'Dermatology',
    topics: {
      'Vesiculobullous & Papulosquamous Disorders': 75,
      'Infective Dermatoses (Leprosy, Fungal, STI)': 95,
      'Pigmentary, Hair & Nail Disorders': 60,
      'Eczema, Drug Reactions & Genodermatoses': 60,
    },
  },
  {
    paper: 'morning',
    subject: 'Pediatrics',
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
    paper: 'morning',
    subject: 'Psychiatry',
    topics: {
      'Schizophrenia & Psychotic Disorders': 70,
      'Mood Disorders (Depression & Bipolar)': 75,
      'Anxiety, OCD & Trauma Disorders': 60,
      'Substance Use & Organic Psychiatry': 65,
      'Child Psychiatry & Mental Healthcare Act': 50,
    },
  },
  {
    paper: 'morning',
    subject: 'PSM (Community Medicine)',
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
    paper: 'morning',
    subject: 'Anaesthesia',
    topics: {
      'Inhalational & Intravenous Anaesthetics': 75,
      'Neuromuscular Blockers & Local Anaesthetics': 75,
      'Airway Management, Circuits & Monitoring': 65,
      'Regional Anaesthesia & CPR (ACLS/BLS)': 65,
    },
  },
  {
    paper: 'morning',
    subject: 'Orthopedics',
    topics: {
      'Upper & Lower Limb Fractures and Dislocations': 100,
      'Peripheral Nerve Injuries & Pediatric Orthopedics': 75,
      'Bone Tumors & Metabolic Bone Disease': 75,
      'Bone Infections (Osteomyelitis, Pott Spine)': 60,
    },
  },

  // Afternoon Paper (7 subjects)
  {
    paper: 'afternoon',
    subject: 'Medicine',
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
    paper: 'afternoon',
    subject: 'General Surgery',
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
    paper: 'afternoon',
    subject: 'Obstetrics & Gynaecology',
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
    paper: 'afternoon',
    subject: 'Radiology',
    topics: {
      'Chest & Cardiovascular Imaging': 90,
      'Abdominal, GI & Hepatobiliary Radiology': 85,
      'Neuroradiology & MSK Signs': 90,
      'Radiation Physics, Contrast & Radiotherapy': 75,
    },
  },
  {
    paper: 'afternoon',
    subject: 'Ophthalmology',
    topics: {
      'Lens, Cataract & Refractive Errors': 105,
      'Glaucoma & Corneal Disorders': 115,
      'Retina, Uvea & Optic Nerve': 125,
      'Strabismus, Orbit, Conjunctiva & Community Ophthal': 95,
    },
  },
  {
    paper: 'afternoon',
    subject: 'ENT',
    topics: {
      'Otology (CSOM, Otosclerosis, Meniere, Audiometry)': 140,
      'Rhinology (Sinusitis, Nasal Polyps, Epistaxis)': 105,
      'Pharynx, Larynx & Neck Masses': 125,
      'Salivary Glands & Head-Neck Oncology': 70,
    },
  },
  {
    paper: 'afternoon',
    subject: 'Forensic Medicine',
    topics: {
      'Medical Jurisprudence, IPC/BNS & Courts': 95,
      'Thanatology & Postmortem Changes': 90,
      'Mechanical Injuries, Firearms & Asphyxia': 115,
      'Forensic Toxicology (Corrosives, Heavy Metals, Organophosphates)': 125,
      'Sexual Offences, Identification & Forensic Psychiatry': 75,
    },
  },
];

// Alias map to normalize CSV/JSON subject spellings during PYQ imports
export const SUBJECT_ALIASES = {
  anatomy: 'Anatomy',
  physiology: 'Physiology',
  biochemistry: 'Biochemistry',
  biochem: 'Biochemistry',
  pathology: 'Pathology',
  microbiology: 'Microbiology',
  pharmacology: 'Pharmacology',
  pharma: 'Pharmacology',
  dermatology: 'Dermatology',
  derma: 'Dermatology',
  pediatrics: 'Pediatrics',
  paediatrics: 'Pediatrics',
  peds: 'Pediatrics',
  psychiatry: 'Psychiatry',
  psm: 'PSM (Community Medicine)',
  'community medicine': 'PSM (Community Medicine)',
  'psm (community medicine)': 'PSM (Community Medicine)',
  'preventive and social medicine': 'PSM (Community Medicine)',
  anaesthesia: 'Anaesthesia',
  anesthesia: 'Anaesthesia',
  anesthesiology: 'Anaesthesia',
  orthopedics: 'Orthopedics',
  orthopaedics: 'Orthopedics',
  ortho: 'Orthopedics',
  medicine: 'Medicine',
  'general medicine': 'Medicine',
  'internal medicine': 'Medicine',
  surgery: 'General Surgery',
  'general surgery': 'General Surgery',
  obg: 'Obstetrics & Gynaecology',
  obgyn: 'Obstetrics & Gynaecology',
  'obstetrics & gynaecology': 'Obstetrics & Gynaecology',
  'obstetrics and gynaecology': 'Obstetrics & Gynaecology',
  'obstetrics and gynecology': 'Obstetrics & Gynaecology',
  radiology: 'Radiology',
  ophthalmology: 'Ophthalmology',
  ophthal: 'Ophthalmology',
  ent: 'ENT',
  otorhinolaryngology: 'ENT',
  'forensic medicine': 'Forensic Medicine',
  fmt: 'Forensic Medicine',
  'forensic medicine and toxicology': 'Forensic Medicine',
};

export function resolveSubjectAndPaper(rawSubject) {
  const key = String(rawSubject || '').trim().toLowerCase();
  const canonical = SUBJECT_ALIASES[key];
  if (!canonical) return null;
  const def = SEED_SUBJECT_CONFIG.find((s) => s.subject === canonical);
  return def ? { subject: def.subject, paper: def.paper } : null;
}
