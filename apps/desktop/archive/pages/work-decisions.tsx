import type { WorkChange, WorkItem } from '@worklens/contracts';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export function WorkDecisions({
  item,
  apply,
  busy,
  onDirty,
}: {
  item: WorkItem;
  apply: (change: WorkChange) => Promise<void>;
  busy: boolean;
  onDirty: () => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [options, setOptions] = useState(['', '']);
  function draft(id: string) {
    setActive(id);
    onDirty();
  }
  return (
    <section className="space-y-4 border-t pt-5" aria-label="Work decisions">
      <h3 className="font-medium">Human–agent decisions</h3>
      <p className="text-sm text-muted-foreground">
        Local declarations, not authenticated human approval. Answers never execute actions or change task
        state. Each request retains its original scope and work revision.
      </p>
      <ol className="divide-y">
        {item.decisions.map((decision) => {
          const { request, resolution } = decision;
          const formId = `resolve-${request.id}`;
          return (
            <li key={request.id} className="space-y-2 py-4">
              <h4 className="font-medium">{request.question}</h4>
              <p className="whitespace-pre-wrap text-sm">{request.context}</p>
              <p className="text-xs text-muted-foreground">
                {request.id} · {resolution.state} · requested by {decision.requestedBy} (declared) ·{' '}
                {decision.requestedAt} · scope: work revision {decision.workRevision}
              </p>
              <p className="text-sm">Options: {request.options.join(' / ')}</p>
              {resolution.state === 'pending' ? (
                <form
                  onChange={() => draft(formId)}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void apply({
                      action: 'decision_answer',
                      id: request.id,
                      answer: String(form.get('answer')),
                      reason: String(form.get('reason')),
                    });
                  }}
                >
                  <fieldset
                    className="flex flex-wrap items-end gap-3"
                    disabled={busy || (active !== null && active !== formId)}
                  >
                    <label className="text-sm">
                      Decision answer
                      <select
                        name="answer"
                        aria-label={`Answer: ${request.question}`}
                        required
                        defaultValue=""
                        className="ml-2 rounded border bg-white p-2"
                      >
                        <option value="" disabled>
                          Select an explicit answer
                        </option>
                        {request.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm" htmlFor={`${formId}-reason`}>
                      Reason
                      <Input
                        id={`${formId}-reason`}
                        name="reason"
                        aria-label={`Reason: ${request.question}`}
                        required
                        maxLength={8192}
                      />
                    </label>
                    <Button>Record answer</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={(event) => {
                        const form = event.currentTarget.form;
                        const reason = form?.elements.namedItem('reason');
                        if (!(reason instanceof HTMLInputElement) || !reason.reportValidity()) return;
                        void apply({ action: 'decision_cancel', id: request.id, reason: reason.value });
                      }}
                    >
                      Cancel request
                    </Button>
                  </fieldset>
                </form>
              ) : (
                <p className="whitespace-pre-wrap text-sm">
                  {resolution.state === 'answered' ? `Answer: ${resolution.answer}` : 'Request cancelled'} ·{' '}
                  {resolution.reason} · {resolution.actor} (declared) · {resolution.at}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <form
        onChange={() => draft('request')}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void apply({
            action: 'decision_request',
            decision: {
              id: requestId,
              question: String(form.get('question')),
              context: String(form.get('context')),
              options: options.map((option) => option.trim()),
            },
          });
        }}
      >
        <fieldset className="space-y-3" disabled={busy || (active !== null && active !== 'request')}>
          <label className="block text-sm" htmlFor="decision-question">
            Decision question
            <Input id="decision-question" name="question" required maxLength={1000} />
          </label>
          <label className="block text-sm" htmlFor="decision-context">
            Decision scope and evidence
            <Input id="decision-context" name="context" required maxLength={8192} />
          </label>
          {options.map((option, index) => (
            // Only append/remove the final option, preserving the other field identities.
            <label key={`option-${index + 1}`} htmlFor={`decision-option-${index}`} className="block text-sm">
              Decision option {index + 1}
              <Input
                id={`decision-option-${index}`}
                required
                maxLength={200}
                value={option}
                onChange={(event) => {
                  setOptions(options.map((value, i) => (i === index ? event.target.value : value)));
                }}
              />
            </label>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={options.length >= 12}
              onClick={() => {
                setOptions([...options, '']);
                draft('request');
              }}
            >
              Add decision option
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={options.length <= 2}
              onClick={() => {
                setOptions(options.slice(0, -1));
                draft('request');
              }}
            >
              Remove last option
            </Button>
          </div>
          <Button>Request decision</Button>
        </fieldset>
      </form>
      {active && (
        <p className="text-sm text-muted-foreground">
          Save this decision draft before other changes. Reload discards the draft.
        </p>
      )}
    </section>
  );
}
