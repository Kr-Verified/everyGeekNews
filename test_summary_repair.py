import unittest
from unittest.mock import Mock, patch

import requests
import pipeline


class SummaryRepairTests(unittest.TestCase):
    def test_validator_rejects_title_source_placeholders(self):
        node = dict(id="N-20260906-01", topic="biz", title="Release", tags=[],
                    date="2026-09-06", popularity=50, oneLiner="Summary",
                    keyPoints=["원문 제목: Release", "출처: Hacker News"],
                    related=[], sources=[], similar=[])
        with self.assertRaisesRegex(ValueError, "핵심 내용이 아닙니다"):
            pipeline.validate_nodes([node])

    def test_build_repairs_merged_placeholders_even_without_new_articles(self):
        node = {"id": "stable", "keyPoints": ["원문 제목: Release"], "sources": []}
        with patch("pipeline.ingest", return_value=[]), \
             patch("pipeline.repair_summaries") as repair:
            result = pipeline.build_nodes(existing_nodes=[node], local=True)
        repair.assert_called_once_with([node], local=True)
        self.assertEqual(result, [node])

    def test_html_list_boundaries_are_preserved(self):
        sentences = pipeline._meaningful_sentences(
            "<ul><li>The compiler removes redundant memory allocations</li>"
            "<li>The runtime supports concurrent garbage collection</li></ul>"
        )
        self.assertEqual(len(sentences), 2)
        self.assertNotIn("<", " ".join(sentences))

    def test_missing_body_does_not_masquerade_as_summary(self):
        summary = pipeline.summarize_cluster_local([
            pipeline.Item("1", "Release title", "u", "Hacker News")
        ])
        self.assertEqual(summary["keyPoints"], [])
        self.assertIn("본문을 확보하지 못해", summary["oneLiner"])

    def test_uses_body_from_non_representative_source(self):
        body = "The new compiler eliminates redundant allocations during compilation."
        summary = pipeline.summarize_cluster_local([
            pipeline.Item("1", "Compiler release", "u1", "HN", points=100),
            pipeline.Item("2", "Compiler release", "u2", "GN", text=body),
        ])
        self.assertEqual(summary["keyPoints"], [body])

    def test_fetches_and_extracts_article_without_comments(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.headers = {"Content-Type": "text/html; charset=utf-8"}
        response.iter_content.return_value = [b"<article>Article body</article>"]
        body = "The new compiler eliminates redundant allocations during compilation."
        item = pipeline.Item("1", "Release", "https://example.com", "HN")
        with patch("pipeline.requests.get", return_value=response), \
             patch("pipeline.trafilatura.extract", return_value=body) as extract:
            pipeline.enrich_item(item)
        self.assertEqual(item.text, body)
        self.assertFalse(extract.call_args.kwargs["include_comments"])

    def test_network_failure_preserves_item(self):
        item = pipeline.Item("1", "Release", "https://example.com", "HN")
        with patch("pipeline.requests.get", side_effect=requests.Timeout):
            self.assertIs(pipeline.enrich_item(item), item)
        self.assertEqual(item.text, "")

    def test_social_page_uses_post_description_instead_of_javascript_notice(self):
        body = "The project now supports offline synchronization across all connected devices."
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.headers = {"Content-Type": "text/html"}
        response.iter_content.return_value = [
            f'<html><head><meta property="og:description" content="{body}"></head></html>'.encode()
        ]
        item = pipeline.Item("1", "Release", "https://example.com", "HN")
        with patch("pipeline.requests.get", return_value=response), \
             patch("pipeline.trafilatura.extract", return_value="Please enable JavaScript to use this application."):
            pipeline.enrich_item(item)
        self.assertEqual(item.text, body)

    def test_repair_keeps_identity_and_good_summaries(self):
        nodes = [{"id": "stable", "title": "Release", "date": "2026-01-01",
                  "keyPoints": ["원문 제목: Release", "출처: HN"],
                  "sources": [{"url": "u", "title": "Release", "source": "HN"}]}]
        body = "The new compiler eliminates redundant allocations during compilation."
        def enrich(item):
            item.text = body
            return item
        with patch("pipeline.enrich_item", side_effect=enrich):
            pipeline.repair_summaries(nodes)
        self.assertEqual(nodes[0]["id"], "stable")
        self.assertEqual(nodes[0]["date"], "2026-01-01")
        self.assertEqual(nodes[0]["keyPoints"], [body])
        with patch("pipeline.enrich_item") as fetch:
            pipeline.repair_summaries(nodes)
        fetch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
