# Manual QA practice pack

This pack turns the R1 product contract into repeatable manual testing work. Every scenario is linked to a requirement ID, seed fixture, test layer, and evidence expected from the tester.

## STLC workflow

1. **Requirements analysis:** read the linked PRD/business rule and identify the observable behavior and risk.
2. **Test planning:** choose the scenario priority, layer, environment, browser, and evidence needed.
3. **Test design:** prepare the documented seed fixture and write the steps from the catalog.
4. **Environment/data preparation:** run the [local automation lab](../AUTOMATION-LAB.md), provision a workspace, and reset before state-sensitive scenarios.
5. **Execution:** record actual results, timestamps, browser, workspace pseudonym, and correlation IDs.
6. **Defect lifecycle:** file a bug with the requirement ID, exact data, expected/actual result, and evidence; retest the fix.
7. **Regression and closure:** rerun linked scenarios, record remaining risk, and complete the test summary.

## Documents

- [Scenario catalog](SCENARIO-CATALOG.md)
- [Exploratory charter template](CHARTER-TEMPLATE.md)
- [Execution record template](EXECUTION-RECORD-TEMPLATE.md)
- [Defect evidence template](DEFECT-REPORT-TEMPLATE.md)

Use only the fictional `.test` identities and simulated payment codes in [TEST-DATA.md](../TEST-DATA.md). Never enter real credentials or card data.
