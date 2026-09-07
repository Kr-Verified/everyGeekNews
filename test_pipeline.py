import json
import unittest
from unittest.mock import Mock, patch

import numpy as np

import pipeline


class PipelineTests(unittest.TestCase):
    def test_cluster_groups_close_vectors(self):
        items = [
            pipeline.Item("1", "a", "u1", "test", points=10),
            pipeline.Item("2", "b", "u2", "test", points=5),
            pipeline.Item("3", "c", "u3", "test", points=1),
        ]
        vectors = np.array([[1, 0], [.99, .01], [0, 1]], dtype=np.float32)
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
        self.assertEqual(sorted(map(len, pipeline.cluster(items, vectors))), [1, 2])

    def test_hackernews_history_item_mapping(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"hits": [{
            "objectID": "42", "title": "A useful story", "url": None,
            "points": 120, "num_comments": 30, "story_text": "body",
        }]}
        with patch("pipeline.requests.get", return_value=response):
            items = pipeline.fetch_hackernews_day("2026-01-02")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].source, "Hacker News")
        self.assertEqual(items[0].published, "2026-01-02")
        self.assertIn("item?id=42", items[0].url)

    def test_current_archive_schema(self):
        with open("public/nodes.json", encoding="utf-8") as handle:
            nodes = json.load(handle)
        pipeline.validate_nodes(nodes)

    def test_local_cluster_only_merges_near_duplicate_titles(self):
        items = [
            pipeline.Item("1", "Python 3.14 performance improvements", "u1", "HN", points=20),
            pipeline.Item("2", "Python 3.14 performance improvement", "u2", "GN", points=10),
            pipeline.Item("3", "New Linux kernel security release", "u3", "HN", points=5),
        ]
        self.assertEqual(sorted(map(len, pipeline.cluster_local(items))), [1, 2])

    def test_local_summary_has_complete_extractable_fields(self):
        item = pipeline.Item(
            "1", "Critical Linux security vulnerability fixed", "https://example.com", "Hacker News",
            text="A vulnerability was fixed in the Linux kernel. Users should update.", points=100,
        )
        summary = pipeline.summarize_cluster_local([item])
        self.assertEqual(summary["topic"], "sec")
        self.assertTrue(summary["tags"])
        self.assertIn("vulnerability", summary["oneLiner"])
        self.assertTrue(summary["keyPoints"])
        self.assertEqual(summary["related"], [])

    def test_local_build_never_calls_openai(self):
        item = pipeline.Item("1", "Rust compiler update", "u1", "test", published="2026-01-02")
        with patch("pipeline.ingest", return_value=[item]), \
             patch("pipeline.embed", side_effect=AssertionError("OpenAI embed called")):
            nodes = pipeline.build_nodes(days=1, local=True)
        pipeline.validate_nodes(nodes)
        self.assertEqual(len(nodes), 1)
        self.assertTrue(nodes[0]["id"].startswith("N-20260102-"))

    def test_node_id_contains_year(self):
        self.assertEqual(pipeline.node_id("2026-01-02", 3), "N-20260102-03")

    def test_local_summary_skips_greeting_number_and_short_sentence(self):
        item = pipeline.Item(
            "1", "Show HN: Useful database migration tool 2026", "https://example.com", "Hacker News",
            text="Hello! 1. Intro. This database migration tool validates every schema change before deployment.",
        )
        summary = pipeline.summarize_cluster_local([item])
        self.assertTrue(summary["oneLiner"].startswith("This database migration"))
        self.assertNotIn("show", summary["tags"])
        self.assertNotIn("hn", summary["tags"])
        self.assertNotIn("2026", summary["tags"])
        self.assertIn("database", summary["tags"])

    def test_unclear_topic_uses_honest_catch_all_or_repository_signal(self):
        self.assertEqual(pipeline.local_topic(["unclassified", "item"]), "biz")
        self.assertEqual(
            pipeline.local_topic(["unclassified"], "https://github.com/example/project"), "oss"
        )

    def test_local_cluster_keeps_recurring_ask_hn_and_versions_separate(self):
        items = [
            pipeline.Item("1", "Ask HN: Who is hiring? (January 2026)", "u1", "HN"),
            pipeline.Item("2", "Ask HN: Who is hiring? (February 2026)", "u2", "HN"),
            pipeline.Item("3", "Acme Model 3.1 release performance", "u3", "HN"),
            pipeline.Item("4", "Acme Model 3.2 release performance", "u4", "HN"),
            pipeline.Item("5", "GPT-4 model release performance", "u5", "HN"),
            pipeline.Item("6", "GPT-5 model release performance", "u6", "HN"),
        ]
        self.assertEqual(sorted(map(len, pipeline.cluster_local(items))), [1, 1, 1, 1, 1, 1])

    def test_related_only_states_observable_multi_source_fact(self):
        items = [
            pipeline.Item("1", "Rust compiler performance improvement", "u1", "HN", points=2),
            pipeline.Item("2", "Rust compiler performance improvements", "u2", "GN", points=1),
        ]
        summary = pipeline.summarize_cluster_local(items)
        self.assertEqual(len(summary["related"]), 1)
        self.assertIn("2건", summary["related"][0])

    def test_local_vectors_are_deterministic_and_normalized(self):
        texts = ["Rust compiler borrow checker", "GPU hardware accelerator"]
        first = pipeline.local_vectors(texts)
        second = pipeline.local_vectors(texts)
        np.testing.assert_array_equal(first, second)
        np.testing.assert_allclose(np.linalg.norm(first, axis=1), [1, 1], atol=1e-6)


if __name__ == "__main__":
    unittest.main()
