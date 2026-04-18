from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import ValidationError, validate

from smarteval.core.models import Artifact, Case, ContractResult
from smarteval.plugins.base import ContractValidator


class JSONSchemaValidator(ContractValidator):
    kind = "json_schema"

    def validate(self, case: Case, artifact: Artifact) -> ContractResult:
        schema = self._load_schema(self.settings["schema"])
        payload = artifact.payload if artifact.kind == "json" else json.loads(str(artifact.payload))
        try:
            validate(instance=payload, schema=schema)
            return ContractResult(passed=True)
        except (ValidationError, json.JSONDecodeError) as exc:
            return ContractResult(passed=False, violations=[str(exc)])

    def _load_schema(self, value: Any) -> Any:
        if isinstance(value, dict):
            return value
        path = Path(value)
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
