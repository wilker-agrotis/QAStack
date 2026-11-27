// Reporter do QAStack para o Playwright.
// Emite uma linha "@@QASTACK@@{json}" por evento no stdout; o app lê essas linhas
// para atualizar os cards em tempo real. Não depende de nenhum pacote.

const PREFIX = '@@QASTACK@@'
const ANSI = /\u001b\[[0-9;]*m/g

function emit(obj) {
  process.stdout.write(PREFIX + JSON.stringify(obj) + '\n')
}

function keyOf(test) {
  const titles = [test.title]
  let file = ''
  for (let s = test.parent; s; s = s.parent) {
    const type = typeof s.type === 'function' ? s.type() : s.type
    if (type === 'describe') titles.unshift(s.title)
    else if (type === 'file') {
      file = s.title
      break
    }
  }
  file = file.split('\\').join('/')
  return { key: file + '::' + titles.join(' › '), file }
}

function projectOf(test) {
  for (let s = test.parent; s; s = s.parent) {
    const type = typeof s.type === 'function' ? s.type() : s.type
    if (type === 'project') return s.title
  }
  return ''
}

class QAStackReporter {
  onBegin(_config, suite) {
    // lista do que vai rodar (já com --grep/--last-failed aplicados), para o app saber
    // quando cada suíte terminou sem esperar o processo inteiro acabar
    const tests = suite.allTests().map(keyOf)
    emit({ type: 'begin', total: tests.length, tests })
  }

  onTestBegin(test) {
    const { key, file } = keyOf(test)
    emit({ type: 'testBegin', key, file, project: projectOf(test) })
  }

  onTestEnd(test, result) {
    const { key, file } = keyOf(test)
    const err = result.error && (result.error.message || result.error.value || '')
    // Com retries o Playwright chama onTestEnd a cada tentativa. "final" diz se esta foi a última:
    // passou/pulou, acabaram as tentativas ou a execução foi interrompida.
    const final =
      result.status === 'passed' ||
      result.status === 'skipped' ||
      result.status === 'interrupted' ||
      result.retry >= test.retries
    emit({
      type: 'testEnd',
      key,
      file,
      project: projectOf(test),
      status: result.status,
      retry: result.retry,
      final,
      durationMs: result.duration,
      error: err ? String(err).replace(ANSI, '').slice(0, 4000) : undefined
    })
  }

  printsToStdio() {
    return false
  }
}

module.exports = QAStackReporter
