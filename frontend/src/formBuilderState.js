// Every section, question and choice in the builder gets a stable client key.
// Updates address items by key through functional state updates, so async
// work (like a media upload) patches whatever the item looks like when it
// finishes instead of writing back a stale copy of the whole form.
let lastClientKey = 0

export function clientKey() {
  lastClientKey += 1
  return `k${lastClientKey}`
}

function keyed(item) {
  return item._key ? item : { ...item, _key: clientKey() }
}

export function withKeys(form) {
  return {
    ...form,
    sections: (form.sections || []).map(section => keyed({
      ...section,
      questions: (section.questions || []).map(question => keyed({
        ...question,
        choices: (question.choices || []).map(keyed),
      })),
    })),
  }
}

export function newQuestion() {
  return {
    _key: clientKey(),
    text: 'Untitled Question',
    question_type: 'short_text',
    required: false,
    choices: [],
  }
}

// Drops client keys and derives `order` from array position, so the server
// always stores the order the editor shows.
export function toPayload(form) {
  return {
    ...form,
    deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
    sections: form.sections.map(({ _key: sectionKey, questions, ...section }, sectionIndex) => ({
      ...section,
      order: sectionIndex,
      questions: questions.map(({ _key: questionKey, choices, ...question }, questionIndex) => ({
        ...question,
        order: questionIndex,
        choices: (choices || []).map(({ _key: choiceKey, ...choice }, choiceIndex) => ({ ...choice, order: choiceIndex })),
      })),
    })),
  }
}
