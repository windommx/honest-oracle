import type { BookConfig, BookTypeKey } from "./types";

export function getQualityStandards(type: BookTypeKey): string {
  const standards: Record<string, string> = {
    novel: `- Show/tell: ≥ 70% show\n- Sensory: ≥ 2 senses per scene\n- Chapter hooks: required at every chapter end\n- Character consistency: tracked via codex\n- Voice consistency: tracked across chapters\n- Pacing: vary between fast/slow scenes\n- TENSION MUST ESCALATE across acts\n- Every scene: conflict + turning point + outcome`,
    nonfiction: `- Argument strength: ≥ 70% claims supported\n- Evidence: ≥ 2 citations per claim\n- Clarity score: ≥ 60%\n- Logic flow: no gaps between paragraphs\n- Pedagogy: objectives + takeaways + exercises\n- Counter-arguments: steelmanned then rebutted\n- THESIS MUST BE FULLY PROVEN by book end\n- All jargon defined on first use`,
    howto: `- Steps: complete, sequential, no gaps\n- Clarity: any reader can follow from step 1\n- Safety: all warnings clearly marked\n- Materials: complete list before steps begin\n- Troubleshooting: common mistakes addressed\n- Visual descriptions for key steps`,
    kids: `- Age-appropriate vocabulary\n- Read-aloud quality\n- Engaging rhythm and repetition\n- Positive, empowering message\n- Illustration notes for every spread\n- ≤ specified word count per page`,
    cookbook: `- Recipe format: standardized\n- Measurements: metric + imperial\n- Steps: one action per numbered step\n- Times: prep + cook + total\n- Allergens: clearly flagged\n- Substitutions offered`,
    textbook: `- Accuracy: all facts verified\n- Pedagogy: objectives + exercises + review\n- Progressive difficulty\n- Assessment questions per chapter\n- Real-world applications\n- Cross-references between chapters`,
    memoir: `- Emotional truth above all\n- Show don't tell for key moments\n- Authentic voice throughout\n- Specific sensory details\n- Theme threaded through every chapter\n- Reflection connects past to present`,
    poetry: `- Original imagery\n- Intentional line breaks\n- Read-aloud quality\n- Economy of language\n- Emotional resonance\n- Collection coherence`,
  };
  return standards[type] ?? standards.nonfiction;
}

export function getWritingRules(c: BookConfig): string {
  switch (c.language) {
    case "thai":
      return `- เขียนภาษาไทยทั้งเล่ม\n- ใช้ภาษาทางการแต่เข้าถึงง่าย\n- หลีกเลี่ยงคำภาษาอังกฤษที่ไม่จำเป็น\n- ใช้ราชาศัพท์เฉพาะบริบทที่เหมาะสม\n`;
    case "english":
      return `- Write entirely in English\n- ${c.voice} voice throughout\n- Avoid passive voice where possible\n- Vary sentence length for rhythm\n`;
    case "bilingual":
      return `- Primary: Thai, with English where natural\n- Key terms: provide both Thai and English\n- Maintain voice consistency across languages\n`;
    default:
      return "";
  }
}

export function getCitationGuide(style: string): string {
  const guides: Record<string, string> = {
    APA: "In-text: (Author, Year). Reference list at chapter/book end.",
    MLA: "In-text: (Author Page). Works Cited at end.",
    Chicago: "Footnotes with full source details.",
    inline: "Mention source naturally in prose. Full details in bibliography.",
    none: "No formal citations. Mention sources naturally where credibility matters.",
  };
  return guides[style] ?? guides.none;
}
export function getQualityChecklist(type: BookTypeKey): string {
  const checklists: Record<string, string> = {
    novel: `  □ Show/tell ratio ≥ 70% show\n  □ ≥ 2 senses in every scene\n  □ Dialogue advances plot or reveals character\n  □ Chapter ends with hook\n  □ Character voices distinct\n  □ No clichés\n  □ Word count within target (±20%)\n  □ Tension appropriate for act position`,
    nonfiction: `  □ All claims supported by evidence\n  □ ≥ 2 citations in chapter\n  □ Jargon defined on first use\n  □ Logic flow between paragraphs\n  □ Pedagogy elements present\n  □ Tone consistent with author voice\n  □ Word count within target (±20%)`,
    howto: `  □ All steps complete and sequential\n  □ Materials list complete\n  □ Safety notes where needed\n  □ Common mistakes addressed\n  □ Visual descriptions included\n  □ Word count within target`,
    kids: `  □ Age-appropriate vocabulary\n  □ Read-aloud quality verified\n  □ Rhythm and repetition present\n  □ Illustration notes included\n  □ Positive message\n  □ Word count within target`,
    cookbook: `  □ Recipe format standardized\n  □ Measurements in metric + imperial\n  □ Ingredients in order of use\n  □ One action per step\n  □ Times and servings specified\n  □ Chef's notes included`,
    textbook: `  □ Learning objectives stated\n  □ Concepts clearly explained\n  □ Examples provided\n  □ Exercises included\n  □ Review questions present\n  □ Difficulty progression appropriate`,
    memoir: `  □ Emotional truth present\n  □ Sensory details in scenes\n  □ Authentic voice\n  □ Theme connection\n  □ Reflection included\n  □ Word count within target`,
    poetry: `  □ Concrete imagery\n  □ Intentional line breaks\n  □ Every word earns its place\n  □ Read-aloud quality\n  □ Original metaphors\n  □ Resonant ending`,
  };
  return checklists[type] ?? checklists.nonfiction;
}
export function getAnalysisMetrics(type: BookTypeKey): string {
  if (type === "novel") {
    return `1. SHOW vs TELL: Is ≥70% showing (action/sensory/dialogue) vs telling?
2. SENSORY DETAIL: ≥2 distinct senses present?
3. VOICE CONSISTENCY: Narration voice consistent?
4. DIALOGUE QUALITY: Does each line advance plot or reveal character?
5. TENSION: Conflict present and escalating appropriately?
6. HOOK: Does the chapter end with a compelling hook?
7. PACING: Variation between fast and slow moments?
8. CHARACTER CONSISTENCY: Characters behaving consistently?
9. CLICHÉ: Any clichés or overused phrasing?
10. WORD COUNT: Within ±20% of target?`;
  }
  if (type === "kids") {
    return `1. AGE-APPROPRIATE VOCABULARY: Within the target reading level?
2. READ-ALOUD FLOW: Rhythm and cadence when read aloud?
3. ENGAGEMENT: Repetition, sound play, interactivity?
4. ILLUSTRATION NOTES: Present for each spread?
5. POSITIVE MESSAGE: Empowering, not preachy?
6. LENGTH: Within target word count?`;
  }
  if (type === "poetry") {
    return `1. IMAGERY: Concrete and original?
2. LINE BREAKS: Intentional and meaningful?
3. ECONOMY: Every word earns its place?
4. SOUND: Reads well aloud?
5. RESONANCE: Does it echo after reading?`;
  }
  return `1. ARGUMENT STRENGTH: Are claims supported by evidence? (0-1)
2. EVIDENCE QUALITY: Strength per the evidence hierarchy?
3. CLARITY: Sentence length, jargon defined, readability? (0-1)
4. LOGIC FLOW: Explicit connections between paragraphs?
5. PEDAGOGY: Objectives, examples, exercises, takeaways present?
6. TONE: Consistent with the author voice?
7. WORD COUNT: Within ±20% of target?
8. CONTRADICTIONS: Any contradiction with earlier chapters?
9. ENGAGEMENT: Examples, variety, actionable content?
10. CITATIONS: Sources attributed in the chosen style?`;
}

export function getRevisionRules(): string {
  return `═══ REVISION RULES ═══
1. Preserve the author's voice and intent.
2. Only change what the analysis flagged — do not rewrite passing material.
3. Keep the chapter within ±20% of the target word count.
4. Apply the specified revision mode:
   - polish: fix surface issues (grammar, word choice, flow)
   - strengthen_evidence: add sources, data, examples
   - clarify: simplify sentences, define terms, add logic connections
   - restructure: reorder sections for better flow
   - deepen: add sensory detail, emotion, character depth
   - rewrite: major revision while keeping core content
5. Output the COMPLETE revised chapter — not a diff, not commentary.`;
}
