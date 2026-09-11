import { VALIDATION_STATUS, worstSeverity } from "./validationStatus";
import type {
  AssetInfo,
  ValidationResult,
  ValidationGroup,
  ValidationItem,
  ValidationSeverity,
} from "../types/asset";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function severityColor(s: ValidationSeverity): string {
  return VALIDATION_STATUS[s].color;
}

function severityLabel(s: ValidationSeverity): string {
  return VALIDATION_STATUS[s].label;
}

function severityEmoji(s: ValidationSeverity): string {
  return VALIDATION_STATUS[s].symbol;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  geometry:
    "기본 지오메트리 수치입니다. 폴리곤 수가 높으면 렌더링 부하가 증가하고, 파일 크기가 크면 로딩 시간이 길어집니다. Degenerate Tris는 면적이 0인 삼각형으로, 렌더링 자원을 낭비합니다.",
  topology:
    "메시 구조의 무결성을 검사합니다. Non-manifold edge는 3개 이상의 면이 공유하는 비정상 edge이며, Open Edge는 검사상 한 면에만 속하는 경계입니다. Normal Consistency는 면의 정점 순서와 정점 노멀의 일치 여부이며 안팎 방향을 판별하지 않습니다. 열린 면은 용도에 따라 정상일 수 있습니다.",
  uv: "UV 좌표는 UV 매핑 텍스처를 메시에 배치할 때 사용합니다. 단색이나 생성 좌표 재질에서는 UV가 불필요할 수 있으며, UV Channel이 여러 개면 라이트맵 등에 활용됩니다.",
  texture:
    "텍스처 관련 정보입니다. 해상도가 너무 높으면 메모리를 많이 사용하고, 누락된 텍스처가 있으면 렌더링 시 핑크색으로 표시될 수 있습니다.",
  material:
    "머티리얼 할당 상태입니다. 머티리얼이 없는 메시는 기본 셰이더로 렌더링되며, 의도한 외관을 표현할 수 없습니다.",
  transform:
    "스케일과 트랜스폼 정보입니다. Non-uniform scale은 라이팅/물리 연산에 문제를 일으킬 수 있고, 중심의 원점 이격은 의도한 배치인지 확인해야 합니다.",
};

const ITEM_EXPLANATIONS: Record<string, string> = {
  Tris: "삼각형(Triangle) 수. 게임 엔진에서 실제 렌더링되는 면의 단위입니다.",
  Verts: "꼭짓점(Vertex) 수. 셰이더가 처리하는 점의 개수입니다.",
  Meshes: "메시 오브젝트 수입니다. 실제 드로우콜은 재질과 렌더링 방식에 따라 달라집니다.",
  "File Size": "모델 파일의 디스크 용량입니다.",
  "Degenerate Tris":
    "면적이 0인 삼각형입니다. 렌더링 자원을 낭비하며 라이팅에 아티팩트를 유발할 수 있습니다.",
  Dimensions: "모델의 바운딩 박스 크기 (X × Y × Z)입니다.",
  "Non-manifold": "3개 이상의 면이 공유하는 변입니다. 의도한 구조인지 원본에서 확인하세요.",
  "Open Edges":
    "같은 위치의 정점을 대응시킨 뒤 하나의 면에 속하는 경계입니다. 의도한 열린 표면일 수 있습니다.",
  "Normal Consistency":
    "면의 정점 순서와 정점 노멀을 비교합니다. 안팎 방향의 올바름을 보장하지 않습니다.",
  "UV Coverage":
    "모든 메시에 UV 채널이 있습니다. 텍스처가 요구하는 채널과 언랩 품질은 별도로 확인합니다.",
  "No UVs": "UV가 필요한 재질인지 먼저 확인하고, 필요할 때만 UV를 펼쳐 내보내세요.",
  "UV Channels": "UV 좌표 세트의 수입니다. 라이트맵에는 보통 2번째 채널을 사용합니다.",
  "Bound Textures":
    "로드된 재질에 실제 연결된 고유 텍스처 수입니다. 주변 파일 이름으로 추정하지 않습니다.",
  "Failed Resources": "로더가 실제로 읽기에 실패한 리소스 수입니다.",
  "Max Resolution": "가장 큰 텍스처의 해상도입니다. 높을수록 GPU 메모리를 많이 사용합니다.",
  Materials: "모델에 사용된 고유 머티리얼 수입니다.",
  "No Material": "머티리얼이 할당되지 않은 메시입니다.",
  Scale: "모든 오브젝트의 스케일이 균일합니다.",
  "Non-uniform Scale":
    "X/Y/Z 스케일이 다른 오브젝트입니다. 의도한 변환인지 목표 환경에서 확인하세요.",
  "Center Offset": "바운딩 박스 중심과 씬 원점의 거리입니다. 피벗이 잘못됐다는 의미는 아닙니다.",
};

function renderItem(item: ValidationItem): string {
  const color = severityColor(item.severity);
  const emoji = severityEmoji(item.severity);
  const explanation = ITEM_EXPLANATIONS[item.label] ?? "";

  return `
    <tr>
      <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;white-space:nowrap;">${escapeHtml(item.label)}</td>
      <td style="padding:6px 10px;font-family:monospace;font-weight:600;color:${color};text-align:right;white-space:nowrap;">
        ${emoji} ${escapeHtml(item.value)}
      </td>
    </tr>
    ${explanation || item.threshold ? `<tr><td colspan="2" style="padding:0 10px 6px 10px;font-size:11px;color:#707080;line-height:1.5;">${escapeHtml(explanation)}${item.threshold ? ` (${escapeHtml(item.threshold)})` : ""}</td></tr>` : ""}
  `;
}

function renderGroup(group: ValidationGroup): string {
  const desc = CATEGORY_DESCRIPTIONS[group.category] ?? "";
  const groupWorst = worstSeverity(group.items.map((item) => item.severity));
  const dotColor = severityColor(groupWorst as ValidationSeverity);

  return `
    <div style="margin-bottom:16px;border-radius:10px;overflow:hidden;background:rgba(26,26,46,0.6);border:1px solid #2a2a4a;">
      <div style="padding:10px 14px;background:rgba(42,42,74,0.5);display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a0a0b0;">${group.label}</span>
        <span style="width:8px;height:8px;border-radius:50%;background:${dotColor};display:inline-block;"></span>
      </div>
      ${desc ? `<p style="padding:8px 14px 0;font-size:11px;color:#707080;line-height:1.6;margin:0;">${desc}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;margin:6px 0;">
        ${group.items.map(renderItem).join("")}
      </table>
    </div>
  `;
}

export function generateHTMLReport(asset: AssetInfo, validation: ValidationResult): string {
  const now = new Date().toLocaleString("ko-KR", { dateStyle: "long", timeStyle: "short" });
  const overallColor = severityColor(validation.overall);
  const overallLabel = severityLabel(validation.overall);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AssetBox Report — ${escapeHtml(asset.fileName)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background:#1a1a2e;
    color:#eaeaea;
    font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;
    padding:32px;
    max-width:700px;
    margin:0 auto;
    line-height:1.5;
  }
  .zoom-controls {
    position:fixed;
    bottom:20px;
    right:20px;
    display:flex;
    gap:4px;
    z-index:100;
  }
  .zoom-controls button {
    width:36px;
    height:36px;
    border:1px solid #2a2a4a;
    border-radius:8px;
    background:rgba(16,24,48,0.95);
    color:#a0a0b0;
    font-size:18px;
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:all 0.15s;
    backdrop-filter:blur(12px);
  }
  .zoom-controls button:hover {
    border-color:#e94560;
    color:#e94560;
  }
  .zoom-controls span {
    min-width:44px;
    height:36px;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:11px;
    font-weight:600;
    color:#707080;
    font-family:monospace;
  }
  @media print {
    body { background:#fff; color:#222; padding:16px; }
    .zoom-controls { display:none; }
  }
</style>
</head>
<body>
  <!-- Header -->
  <div style="margin-bottom:24px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <span style="font-size:24px;font-weight:800;color:#e94560;">AssetBox</span>
      <span style="font-size:12px;color:#a0a0b0;background:#16213e;padding:4px 10px;border-radius:6px;">Validation Report</span>
    </div>
    <p style="font-size:12px;color:#707080;">${now}</p>
  </div>

  <!-- File Info -->
  <div style="margin-bottom:20px;padding:14px 18px;border-radius:10px;background:#16213e;border:1px solid #2a2a4a;">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span style="font-family:monospace;font-size:11px;text-transform:uppercase;font-weight:700;color:#e94560;background:#0f3460;padding:4px 10px;border-radius:6px;">${escapeHtml(asset.format)}</span>
      <span style="font-size:16px;font-weight:700;color:#eaeaea;">${escapeHtml(asset.fileName)}</span>
    </div>
    <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:13px;font-weight:600;color:#a0a0b0;">Overall:</span>
      <span style="font-size:14px;font-weight:700;color:${overallColor};background:${overallColor}20;padding:4px 14px;border-radius:20px;">${overallLabel}</span>
    </div>
  </div>

  <p style="margin-bottom:16px;color:#b0b9c9;font-size:12px;">검사 결과는 용도에 맞춰 검토하세요. 성능 수치는 참고 예산이며, 확인 불가는 정상 판정이 아닙니다. 확인 불가 항목: ${validation.items.filter((item) => item.severity === "unknown").length}개.</p>
  <!-- Validation Groups -->
  ${validation.groups.map(renderGroup).join("")}

  ${
    asset.textures.length > 0 || asset.missingTextures.length > 0
      ? `
  <!-- Nearby files are discovery hints, not material bindings. -->
  <div style="margin-bottom:16px;border-radius:10px;overflow:hidden;background:rgba(26,26,46,0.6);border:1px solid #2a2a4a;">
    <div style="padding:10px 14px;background:rgba(42,42,74,0.5);">
      <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a0a0b0;">Nearby Texture Files</span>
    </div>
    <div style="padding:8px 14px;">
      ${asset.textures
        .map(
          (tex) => `
        <div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;">
          <span style="font-family:monospace;text-transform:uppercase;color:#e94560;width:50px;flex-shrink:0;">${escapeHtml(tex.type.slice(0, 6))}</span>
          <span style="color:#eaeaea;">${escapeHtml(tex.fileName)}</span>
          ${tex.resolution ? `<span style="color:#707080;margin-left:auto;font-size:11px;">${tex.resolution.width}×${tex.resolution.height}</span>` : ""}
        </div>
      `
        )
        .join("")}
      ${asset.missingTextures.length > 0 ? `<p style="font-size:11px;color:#fbbf24;margin-top:6px;">Failed resources: ${escapeHtml(asset.missingTextures.join(", "))}</p>` : ""}
    </div>
  </div>
  `
      : ""
  }

  ${
    asset.retopoDiag
      ? `
  <!-- Retopology Diagnosis -->
  <div style="margin-bottom:16px;border-radius:10px;overflow:hidden;background:rgba(26,26,46,0.6);border:1px solid #2a2a4a;">
    <div style="padding:10px 14px;background:rgba(42,42,74,0.5);display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a0a0b0;">Retopology Diagnosis</span>
      <span style="width:8px;height:8px;border-radius:50%;background:${asset.retopoDiag.needsRetopo ? "#f87171" : "#4ade80"};display:inline-block;"></span>
    </div>
    <p style="padding:8px 14px 0;font-size:11px;color:#707080;line-height:1.6;margin:0;">
      메시의 삼각형 밀도 분포와 형태를 분석하여 검토할 부분을 안내합니다. 리토폴로지가 반드시 필요하다는 판정은 아닙니다.
      밀도가 불균일하거나 얇은 삼각형이 많으면 렌더링 효율이 떨어지고 텍스처 왜곡이 발생할 수 있습니다.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:6px 0;">
      <tr>
        <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;">판정</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:600;text-align:right;color:${asset.retopoDiag.needsRetopo ? "#f87171" : "#4ade80"};">
          ${asset.retopoDiag.needsRetopo ? "△ Review triangle distribution" : "✓ No density flags"}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;">총 삼각형</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:600;text-align:right;color:#eaeaea;">
          ${asset.retopoDiag.totalTris.toLocaleString()}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;">얇은 삼각형</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:600;text-align:right;color:${asset.retopoDiag.thinTriPercent > 5 ? "#f87171" : "#4ade80"};">
          ${asset.retopoDiag.thinTriPercent.toFixed(1)}%
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0 10px 6px;font-size:11px;color:#707080;">Aspect ratio가 10:1을 초과하는 삼각형입니다. 텍스처 스트레칭과 라이팅 아티팩트를 유발합니다.</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;">과밀 영역</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:600;text-align:right;color:${asset.retopoDiag.overDensePercent > 10 ? "#f87171" : "#4ade80"};">
          ${asset.retopoDiag.overDensePercent.toFixed(1)}%
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0 10px 6px;font-size:11px;color:#707080;">평균 면적의 10% 미만인 삼각형입니다. 의도한 디테일 분포인지 확인하세요.</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;">과소 영역</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:600;text-align:right;color:${asset.retopoDiag.underDensePercent > 10 ? "#f87171" : "#4ade80"};">
          ${asset.retopoDiag.underDensePercent.toFixed(1)}%
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0 10px 6px;font-size:11px;color:#707080;">평균 면적의 5배를 초과하는 삼각형입니다. 의도한 디테일 분포인지 확인하세요.</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;">밀도 편차</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:600;text-align:right;color:${asset.retopoDiag.densityRatio > 1000 ? "#f87171" : asset.retopoDiag.densityRatio > 100 ? "#fbbf24" : "#4ade80"};">
          ${asset.retopoDiag.densityRatio === Infinity ? "∞" : asset.retopoDiag.densityRatio.toFixed(0)}x
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0 10px 6px;font-size:11px;color:#707080;">가장 큰 삼각형과 가장 작은 삼각형의 면적 비율입니다. 높을수록 밀도가 불균일합니다.</td>
      </tr>
    </table>
    ${
      asset.retopoDiag.reasons.length > 0
        ? `<div style="padding:6px 14px 10px;border-top:1px solid #2a2a4a;">
        <span style="font-size:11px;font-weight:600;color:#fbbf24;">Issues:</span>
        <ul style="margin:4px 0 0;padding-left:16px;font-size:11px;color:#a0a0b0;">
          ${asset.retopoDiag.reasons.map((r) => `<li style="margin-bottom:2px;">${escapeHtml(r)}</li>`).join("")}
        </ul>
      </div>`
        : ""
    }
  </div>
  `
      : ""
  }

  <!-- Footer -->
  <div style="margin-top:24px;padding-top:14px;border-top:1px solid #2a2a4a;font-size:11px;color:#505060;text-align:center;">
    Generated by AssetBox
  </div>

  <!-- Zoom Controls -->
  <div class="zoom-controls">
    <button onclick="zoom(-10)" title="Zoom out">-</button>
    <span id="zoom-level">100%</span>
    <button onclick="zoom(10)" title="Zoom in">+</button>
    <button onclick="zoom(0)" title="Reset zoom" style="font-size:12px;">R</button>
  </div>
  <script>
    let zoomPct = 100;
    function zoom(delta) {
      zoomPct = delta === 0 ? 100 : Math.max(50, Math.min(200, zoomPct + delta));
      document.body.style.zoom = zoomPct + "%";
      document.getElementById("zoom-level").textContent = zoomPct + "%";
    }
  </script>
</body>
</html>`;
}
