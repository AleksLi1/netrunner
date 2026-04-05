NTP/1
FROM {repo-name}@{commit-hash} [{branch}]
TO {target-repo-name}
TS {YYYY-MM-DDTHH:MM:SSZ}
DOMAIN {quant|web|api|systems|mobile|desktop|data-analysis|data-eng|general}
CONFIDENCE {low|medium|high}

---SUMMARY
{1-3 lines: what was found and why it matters to the receiving repo}

---FINDINGS
F1 type:{type} name:{name} {metric:value} [valid:{method}] [status:{validated|experimental}]

---CODE
F1:
{actual implementation code — not pseudocode}

---DISCOVERY
CONCEPTS {space-separated domain concepts}
TOUCHES {space-separated integration point keywords}
LANG {primary language}
DEPS {space-separated dependencies with version constraints}
PATTERNS {space-separated code patterns to grep for in target}

---CONSTRAINTS
TEMPORAL {safe:lookback_only | risk:{description} | unknown}
DEPS {hard dependency requirements}

---VERIFY
F1: {metric}{operator}{threshold} [{conditions}]
INTEGRATION {end-to-end verification criteria}

---DELTA
+{new_field}:{value}
~{modified_field}:{value}
-{removed_field}
