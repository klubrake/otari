"""Fork gate: a deployment records no agent trace, and no trace content, unless told to.

Upstream turns trace capture on by default, and can keep a session's prompts and
tool calls once content is switched on. This fork ships no Sessions page and keeps
every one of those off by default. Each check fails if an upstream sync flips a
default, so the merge that does cannot pass quietly.
"""

import pytest

from gateway.core.config import GatewayConfig


@pytest.mark.parametrize(
    "setting",
    [
        "trace_capture_enabled",
        "trace_content_enabled",
        "trace_content_tool_output",
        "trace_platform_break_glass_enabled",
    ],
)
def test_the_setting_is_off_by_default(setting: str) -> None:
    assert GatewayConfig.model_fields[setting].default is False
