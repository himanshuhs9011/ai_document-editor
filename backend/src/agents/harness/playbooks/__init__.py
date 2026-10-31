"""Every profession playbook, in the order the Studio lists them."""
from typing import Dict

from ..playbook import Playbook
from .article import ARTICLE
from .course import COURSE
from .film import FILM
from .legal import LEGAL
from .medical import MEDICAL
from .news import NEWS
from .reels import REELS
from .report import REPORT
from .research import RESEARCH
from .social import SOCIAL
from .youtube import YOUTUBE

PLAYBOOKS: Dict[str, Playbook] = {
    playbook.id: playbook
    for playbook in (LEGAL, MEDICAL, REPORT, RESEARCH, NEWS, ARTICLE, SOCIAL, FILM, YOUTUBE, REELS, COURSE)
}
