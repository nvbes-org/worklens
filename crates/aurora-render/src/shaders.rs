pub const METAL_TERMINAL_SHADER: &str = r#"
#include <metal_stdlib>
using namespace metal;

struct VertexInput {
    float2 position [[attribute(0)]];
    float2 texcoord [[attribute(1)]];
    float4 fg_color [[attribute(2)]];
    float4 bg_color [[attribute(3)]];
};

struct VertexOutput {
    float4 position [[position]];
    float2 texcoord;
    float4 fg_color;
    float4 bg_color;
};

vertex VertexOutput terminal_vertex(VertexInput in [[stage_in]],
                                    constant float2 &viewport_size [[buffer(1)]]) {
    VertexOutput out;
    float2 pixel_pos = in.position;
    float2 ndc = (pixel_pos / viewport_size) * 2.0 - 1.0;
    out.position = float4(ndc.x, -ndc.y, 0.0, 1.0);
    out.texcoord = in.texcoord;
    out.fg_color = in.fg_color;
    out.bg_color = in.bg_color;
    return out;
}

fragment float4 terminal_fragment(VertexOutput in [[stage_in]],
                                  texture2d<float> glyph_atlas [[texture(0)]],
                                  sampler atlas_sampler [[sampler(0)]]) {
    float4 glyph_alpha = glyph_atlas.sample(atlas_sampler, in.texcoord);
    float4 text_col = in.fg_color * glyph_alpha.r;
    float4 bg_col = in.bg_color * (1.0 - glyph_alpha.r);
    return text_col + bg_col;
}
"#;

pub const METAL_CRT_SHADER: &str = r#"
#include <metal_stdlib>
using namespace metal;

struct CrtUniforms {
    float time;
    float curvature;
    float scanline_intensity;
    float bloom_intensity;
};

fragment float4 crt_postprocess(float4 in_pos [[position]],
                                float2 uv [[stage_in]],
                                texture2d<float> scene_texture [[texture(0)]],
                                sampler scene_sampler [[sampler(0)]],
                                constant CrtUniforms &uniforms [[buffer(0)]]) {
    // Barrel screen curvature
    float2 centered = uv * 2.0 - 1.0;
    float2 curved = centered * (1.0 + uniforms.curvature * dot(centered, centered));
    float2 final_uv = curved * 0.5 + 0.5;

    if (final_uv.x < 0.0 || final_uv.x > 1.0 || final_uv.y < 0.0 || final_uv.y > 1.0) {
        return float4(0.0, 0.0, 0.0, 1.0);
    }

    float4 color = scene_texture.sample(scene_sampler, final_uv);

    // Scanlines
    float scanline = sin(final_uv.y * 800.0) * 0.5 + 0.5;
    color.rgb -= scanline * uniforms.scanline_intensity;

    // Phosphor glow bloom
    color.rgb += color.rgb * uniforms.bloom_intensity;

    return color;
}
"#;
