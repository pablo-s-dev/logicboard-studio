const temporaryGhdlPath = /^(?:[a-z]:)?[^\r\n]*?[\\/]logicboard-(?:(?:sim|session)-)?\d+[\\/]/i;

export function uniqueProblems(problems: string[]) {
  const seen = new Set<string>();
  return problems.filter((problem) => {
    const fingerprint = problem.replace(temporaryGhdlPath, "").replaceAll("\\", "/");
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
