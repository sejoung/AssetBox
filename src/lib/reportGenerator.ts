import type {
  AssetInfo,
  ValidationResult,
  ValidationGroup,
  ValidationItem,
  ValidationSeverity,
} from "../types/asset";

function severityColor(s: ValidationSeverity): string {
  return s === "good" ? "#4ade80" : s === "warning" ? "#fbbf24" : "#f87171";
}

function severityLabel(s: ValidationSeverity): string {
  return s === "good" ? "Good" : s === "warning" ? "Warning" : "Bad";
}

function severityEmoji(s: ValidationSeverity): string {
  return s === "good" ? "✅" : s === "warning" ? "⚠️" : "❌";
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  geometry:
    "기본 지오메트리 수치입니다. 폴리곤 수가 높으면 렌더링 부하가 증가하고, 파일 크기가 크면 로딩 시간이 길어집니다. Degenerate Tris는 면적이 0인 삼각형으로, 렌더링 자원을 낭비합니다.",
  topology:
    "메시 구조의 무결성을 검사합니다. Non-manifold edge는 3개 이상의 면이 공유하는 비정상 edge이며, Open Edge는 메시가 닫혀있지 않음(워터타이트가 아님)을 의미합니다. Flipped Normal은 면이 뒤집혀 보이지 않는 문제를 유발합니다.",
  uv: "UV 좌표는 텍스처를 메시에 매핑하는 데 필요합니다. UV가 없으면 텍스처를 적용할 수 없으며, UV Channel이 여러 개면 라이트맵 등에 활용됩니다.",
  texture:
    "텍스처 관련 정보입니다. 해상도가 너무 높으면 메모리를 많이 사용하고, 누락된 텍스처가 있으면 렌더링 시 핑크색으로 표시될 수 있습니다.",
  material:
    "머티리얼 할당 상태입니다. 머티리얼이 없는 메시는 기본 셰이더로 렌더링되며, 의도한 외관을 표현할 수 없습니다.",
  transform:
    "스케일과 트랜스폼 정보입니다. Non-uniform scale은 라이팅/물리 연산에 문제를 일으킬 수 있고, 피벗이 원점에서 벗어나면 엔진 import 시 위치가 어긋날 수 있습니다.",
};

const ITEM_EXPLANATIONS: Record<string, string> = {
  Tris: "삼각형(Triangle) 수. 게임 엔진에서 실제 렌더링되는 면의 단위입니다.",
  Verts: "꼭짓점(Vertex) 수. 셰이더가 처리하는 점의 개수입니다.",
  Meshes: "메시 오브젝트 수. 각 메시는 별도의 드로우콜을 발생시킵니다.",
  "File Size": "모델 파일의 디스크 용량입니다.",
  "Degenerate Tris":
    "면적이 0인 삼각형입니다. 렌더링 자원을 낭비하며 라이팅에 아티팩트를 유발할 수 있습니다.",
  Dimensions: "모델의 바운딩 박스 크기 (X × Y × Z)입니다.",
  "Non-manifold":
    "3개 이상의 면이 공유하는 edge입니다. 3D 프린팅 및 물리 연산에서 문제를 일으킵니다.",
  "Open Edges": "하나의 면에만 속하는 경계 edge입니다. 메시가 완전히 닫혀 있지 않음을 의미합니다.",
  "Flipped Normals":
    "면의 법선이 안쪽을 향해 렌더링 시 보이지 않는 삼각형입니다. Normals 뷰 모드에서 빨간 점으로 표시됩니다.",
  "UV Coverage": "모든 메시에 UV 좌표가 할당되어 있어 텍스처 매핑이 가능합니다.",
  "No UVs": "UV 좌표가 없는 메시입니다. 텍스처를 적용할 수 없습니다.",
  "UV Channels": "UV 좌표 세트의 수입니다. 라이트맵에는 보통 2번째 채널을 사용합니다.",
  Textures: "모델에 연결된 텍스처 파일 수입니다.",
  Missing: "이름 규칙에 따라 있어야 하지만 발견되지 않은 텍스처입니다.",
  "Max Resolution": "가장 큰 텍스처의 해상도입니다. 높을수록 GPU 메모리를 많이 사용합니다.",
  Materials: "모델에 사용된 고유 머티리얼 수입니다.",
  "No Material": "머티리얼이 할당되지 않은 메시입니다.",
  Scale: "모든 오브젝트의 스케일이 균일합니다.",
  "Non-uniform Scale": "X/Y/Z 스케일이 다른 오브젝트입니다. 노멀 계산에 문제를 일으킬 수 있습니다.",
  Pivot: "모델의 피벗이 원점 근처에 있습니다.",
  "Pivot Offset":
    "모델의 중심이 원점에서 벗어나 있습니다. 엔진 import 시 위치가 어긋날 수 있습니다.",
};

function renderItem(item: ValidationItem): string {
  const color = severityColor(item.severity);
  const emoji = severityEmoji(item.severity);
  const explanation = ITEM_EXPLANATIONS[item.label] ?? "";

  return `
    <tr>
      <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;white-space:nowrap;">${item.label}</td>
      <td style="padding:6px 10px;font-family:monospace;font-weight:600;color:${color};text-align:right;white-space:nowrap;">
        ${emoji} ${item.value}
      </td>
    </tr>
    ${explanation ? `<tr><td colspan="2" style="padding:0 10px 6px 10px;font-size:11px;color:#707080;line-height:1.5;">${explanation}${item.threshold ? ` (${item.threshold})` : ""}</td></tr>` : ""}
  `;
}

function renderGroup(group: ValidationGroup): string {
  const desc = CATEGORY_DESCRIPTIONS[group.category] ?? "";
  const groupWorst = group.items.some((i) => i.severity === "bad")
    ? "bad"
    : group.items.some((i) => i.severity === "warning")
      ? "warning"
      : "good";
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
<title>AssetBox Report — ${asset.fileName}</title>
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
  @media print {
    body { background:#fff; color:#222; padding:16px; }
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
      <span style="font-family:monospace;font-size:11px;text-transform:uppercase;font-weight:700;color:#e94560;background:#0f3460;padding:4px 10px;border-radius:6px;">${asset.format}</span>
      <span style="font-size:16px;font-weight:700;color:#eaeaea;">${asset.fileName}</span>
    </div>
    <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:13px;font-weight:600;color:#a0a0b0;">Overall:</span>
      <span style="font-size:14px;font-weight:700;color:${overallColor};background:${overallColor}20;padding:4px 14px;border-radius:20px;">${overallLabel}</span>
    </div>
  </div>

  <!-- Validation Groups -->
  ${validation.groups.map(renderGroup).join("")}

  ${
    asset.textures.length > 0
      ? `
  <!-- Texture Files -->
  <div style="margin-bottom:16px;border-radius:10px;overflow:hidden;background:rgba(26,26,46,0.6);border:1px solid #2a2a4a;">
    <div style="padding:10px 14px;background:rgba(42,42,74,0.5);">
      <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#a0a0b0;">Texture Files</span>
    </div>
    <div style="padding:8px 14px;">
      ${asset.textures
        .map(
          (tex) => `
        <div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;">
          <span style="font-family:monospace;text-transform:uppercase;color:#e94560;width:50px;flex-shrink:0;">${tex.type.slice(0, 6)}</span>
          <span style="color:#eaeaea;">${tex.fileName}</span>
          ${tex.resolution ? `<span style="color:#707080;margin-left:auto;font-size:11px;">${tex.resolution.width}×${tex.resolution.height}</span>` : ""}
        </div>
      `
        )
        .join("")}
      ${asset.missingTextures.length > 0 ? `<p style="font-size:11px;color:#fbbf24;margin-top:6px;">Missing: ${asset.missingTextures.join(", ")}</p>` : ""}
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
      메시의 삼각형 밀도 분포와 형태를 분석하여 리토폴로지 필요성을 진단합니다.
      밀도가 불균일하거나 얇은 삼각형이 많으면 렌더링 효율이 떨어지고 텍스처 왜곡이 발생할 수 있습니다.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:6px 0;">
      <tr>
        <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;">판정</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:600;text-align:right;color:${asset.retopoDiag.needsRetopo ? "#f87171" : "#4ade80"};">
          ${asset.retopoDiag.needsRetopo ? "❌ Retopology Recommended" : "✅ Topology OK"}
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
        <td colspan="2" style="padding:0 10px 6px;font-size:11px;color:#707080;">평균 면적의 10% 미만인 삼각형입니다. 불필요하게 폴리곤을 낭비하는 영역입니다.</td>
      </tr>
      <tr>
        <td style="padding:6px 10px;color:#a0a0b0;font-size:13px;">과소 영역</td>
        <td style="padding:6px 10px;font-family:monospace;font-weight:600;text-align:right;color:${asset.retopoDiag.underDensePercent > 10 ? "#f87171" : "#4ade80"};">
          ${asset.retopoDiag.underDensePercent.toFixed(1)}%
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:0 10px 6px;font-size:11px;color:#707080;">평균 면적의 5배를 초과하는 삼각형입니다. 디테일이 부족한 영역입니다.</td>
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
          ${asset.retopoDiag.reasons.map((r) => `<li style="margin-bottom:2px;">${r}</li>`).join("")}
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
</body>
</html>`;
}
