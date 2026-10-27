import { describe, it, expect, vi } from 'vitest';
import { db } from '../../server/db.js';

describe('TimescaleDB Chunk Compression Test Suite', () => {
  it('should format compress_chunk query with explicit text parameters $1::text, $2::text', async () => {
    const mockQuery = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('timescaledb_information.chunks')) {
        return {
          rows: [
            { chunk_schema: '_timescaledb_internal', chunk_name: '_hyper_1_1_chunk' },
            { chunk_schema: '_timescaledb_internal', chunk_name: '_hyper_1_4_chunk' },
          ],
        };
      }
      if (sql.includes('pg_total_relation_size')) {
        return { rows: [{ bytes: 10485760 }] };
      }
      if (sql.includes('compress_chunk')) {
        return { rows: [{ compress_chunk: 1 }] };
      }
      return { rows: [] };
    });

    vi.spyOn(db, 'getPgPool').mockReturnValue({ query: mockQuery } as any);
    if (db.postgresRepo) {
      vi.spyOn(db.postgresRepo, 'isReady').mockReturnValue(true);
    }

    const result = await db.compressTimescaleChunksNow();

    expect(result.success).toBe(true);
    expect(result.chunksCount).toBe(2);

    // Verify query format passed $1::text, $2::text
    const compressCalls = mockQuery.mock.calls.filter((call) =>
      String(call[0]).includes('compress_chunk')
    );
    expect(compressCalls.length).toBe(2);
    expect(compressCalls[0][0]).toContain('$1::text');
    expect(compressCalls[0][0]).toContain('$2::text');
    expect(compressCalls[0][1]).toEqual(['_timescaledb_internal', '_hyper_1_1_chunk']);
  });
});
