use super::*;

fn fixture() -> (ValidationExpectation, ValidationObservation, Provenance) {
    let expected = ValidationExpectation {
        repository: "owner/repo".into(),
        kind: ValidationKind::Check,
        name: "test".into(),
        app_id: Some(42),
    };
    let observed = ValidationObservation {
        id: "check:1".into(),
        kind: ValidationKind::Check,
        name: "test".into(),
        app_id: Some(42),
        sha: "a".repeat(40),
        outcome: ValidationOutcome::Success,
        raw_state: "success".into(),
        url: None,
    };
    let mut source = Provenance::observed("GitHub checks");
    source.revision = Some(observed.sha.clone());
    (expected, observed, source)
}

#[test]
fn only_explicit_success_satisfies_expected_validation() {
    let (expected, mut observed, source) = fixture();
    for outcome in [
        ValidationOutcome::Success,
        ValidationOutcome::Failure,
        ValidationOutcome::Pending,
        ValidationOutcome::Cancelled,
        ValidationOutcome::Skipped,
        ValidationOutcome::Neutral,
        ValidationOutcome::TimedOut,
        ValidationOutcome::ActionRequired,
        ValidationOutcome::Unknown,
    ] {
        observed.outcome = outcome.clone();
        let result = assess_validations(
            std::slice::from_ref(&expected),
            std::slice::from_ref(&observed),
            std::slice::from_ref(&source),
            &observed.sha,
        );
        assert_eq!(result[0].outcome, outcome);
        assert_eq!(
            validation_summary(&result) == "satisfied",
            outcome == ValidationOutcome::Success
        );
    }
    assert_eq!(validation_summary(&[]), "not_configured");
}

#[test]
fn missing_wrong_sha_wrong_app_and_ambiguous_checks_are_not_success() {
    let (expected, observed, source) = fixture();
    let check = |observations: &[ValidationObservation], source: &Provenance| {
        assess_validations(
            std::slice::from_ref(&expected),
            observations,
            std::slice::from_ref(source),
            &observed.sha,
        )[0]
        .outcome
        .clone()
    };
    assert_eq!(check(&[], &source), ValidationOutcome::Missing);
    let mut wrong = observed.clone();
    wrong.sha = "b".repeat(40);
    assert_eq!(check(&[wrong], &source), ValidationOutcome::Missing);
    let mut wrong = observed.clone();
    wrong.app_id = Some(99);
    assert_eq!(check(&[wrong], &source), ValidationOutcome::Missing);
    assert_eq!(
        check(&[observed.clone(), observed.clone()], &source),
        ValidationOutcome::Ambiguous
    );
    let mut partial = source.clone();
    partial.status = Availability::Partial;
    assert_eq!(
        check(std::slice::from_ref(&observed), &partial),
        ValidationOutcome::Unknown
    );
    partial.status = Availability::Available;
    partial.revision = Some("b".repeat(40));
    assert_eq!(
        check(std::slice::from_ref(&observed), &partial),
        ValidationOutcome::Unknown
    );
}
