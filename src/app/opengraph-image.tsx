import { ImageResponse } from 'next/og';

/**
 * Open Graph image for social sharing.
 *
 * Dynamically generates a branded OG image at 1200x630 pixels
 * for optimal display on social platforms (Facebook, LinkedIn, Twitter).
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */

// Image metadata
export const alt = 'Average Joe Trades - Free Stock & Options Trading Journal';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Image generation
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090b',
          backgroundImage:
            'radial-gradient(circle at 25% 25%, #10b981 0%, transparent 50%), radial-gradient(circle at 75% 75%, #059669 0%, transparent 50%)',
          padding: '60px',
        }}
      >
        {/* Logo/Icon area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '30px',
          }}
        >
          <div
            style={{
              width: '100px',
              height: '100px',
              borderRadius: '24px',
              backgroundColor: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 25px 50px -12px rgba(16, 185, 129, 0.5)',
            }}
          >
            <span style={{ fontSize: '60px', color: 'white' }}>AJ</span>
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: 'white',
            textAlign: 'center',
            lineHeight: 1.1,
            marginBottom: '20px',
            textShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
          }}
        >
          Average Joe Trades
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 36,
            color: '#a1a1aa',
            textAlign: 'center',
            marginBottom: '40px',
          }}
        >
          Free Stock & Options Trading Journal
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {['FIFO P&L Tracking', 'Multi-Broker Sync', 'AI Insights', 'Wheel Strategy'].map(
            (feature) => (
              <div
                key={feature}
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: '9999px',
                  padding: '12px 24px',
                  fontSize: 24,
                  color: '#34d399',
                }}
              >
                {feature}
              </div>
            )
          )}
        </div>

      </div>
    ),
    {
      ...size,
    }
  );
}
