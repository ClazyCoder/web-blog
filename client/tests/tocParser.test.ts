import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMarkdownHeadings, resolveHeadingId } from '../src/utils/tocParser.ts';

test('duplicate Korean headings keep distinct IDs across repeated renders', () => {
    const headings = parseMarkdownHeadings('## 마무리\n\n본문\n\n## 마무리');
    for (let render = 0; render < 3; render++) {
        assert.equal(resolveHeadingId('마무리', 2, headings, 1), '마무리');
        assert.equal(resolveHeadingId('마무리', 2, headings, 5), '마무리-1');
    }
});

test('source positions remain aligned after fenced code and formatted headings', () => {
    const headings = parseMarkdownHeadings('```md\n## 가짜\n```\n\n## **실제** 제목');
    assert.equal(headings.length, 1);
    assert.equal(resolveHeadingId('실제 제목', 2, headings, 5), headings[0].id);
});

test('unlisted HTML headings have stable positional fallback IDs', () => {
    assert.equal(resolveHeadingId('추가 제목', 2, [], 12), '추가-제목-12');
    assert.notEqual(resolveHeadingId('추가 제목', 2, [], 12), resolveHeadingId('추가 제목', 2, [], 18));
});
